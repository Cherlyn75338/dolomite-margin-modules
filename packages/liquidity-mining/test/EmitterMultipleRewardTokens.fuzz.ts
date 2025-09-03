import { createContractWithAbi, depositIntoDolomiteMargin } from '@dolomite-exchange/modules-base/src/utils/dolomite-utils';
import { Network, ONE_ETH_BI, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectWalletBalance, expectProtocolBalance, expectThrow } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { disableInterestAccrual, getDefaultCoreProtocolConfig, setupCoreProtocol, setupUSDCBalance, setupWETHBalance } from '@dolomite-exchange/modules-base/test/utils/setup';
import { setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { EmitterMultipleRewardTokens, EmitterMultipleRewardTokens__factory, MintableStorageVault, MintableStorageVault__factory } from '../src/types';
import { createOARB } from './liquidity-mining-ecosystem-utils';

// Focused fuzz/invariant-style tests for EmitterMultipleRewardTokens

const defaultAccountNumber = ZERO_BI;
const defaultAllocPoint = BigNumber.from('100');
const usdcAmount = BigNumber.from('100816979');
const wethAmount = BigNumber.from('1003933040428380918');

describe('EmitterMultipleRewardTokens.fuzz', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let emitter: EmitterMultipleRewardTokens;
  let vault1: MintableStorageVault;
  let vault2: MintableStorageVault;
  let oARB1: any;
  let oARB2: any;
  let startTime: number;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    await disableInterestAccrual(core, core.marketIds.usdc);
    await disableInterestAccrual(core, core.marketIds.weth);

    oARB1 = await createOARB(core);
    oARB2 = await createOARB(core);
    vault1 = await createContractWithAbi<MintableStorageVault>(
      MintableStorageVault__factory.abi,
      MintableStorageVault__factory.bytecode,
      [core.dolomiteMargin.address, oARB1.address],
    );
    vault2 = await createContractWithAbi<MintableStorageVault>(
      MintableStorageVault__factory.abi,
      MintableStorageVault__factory.bytecode,
      [core.dolomiteMargin.address, oARB2.address],
    );
    startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 5;
    emitter = await createContractWithAbi<EmitterMultipleRewardTokens>(
      EmitterMultipleRewardTokens__factory.abi,
      EmitterMultipleRewardTokens__factory.bytecode,
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, ONE_ETH_BI, startTime],
    );

    await setupUSDCBalance(core, core.hhUser1, usdcAmount.mul(10), core.dolomiteMargin);
    await setupWETHBalance(core, core.hhUser1, wethAmount.mul(10), core.dolomiteMargin);
    await depositIntoDolomiteMargin(core, core.hhUser1, defaultAccountNumber, core.marketIds.weth, wethAmount.mul(5));

    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vault1.address, true);
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vault2.address, true);

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('accrual remains consistent across add/disable/remove sequences', async () => {
    await emitter.connect(core.governance).ownerAddRewardToken(oARB1.address, vault1.address, true);
    await emitter.connect(core.governance).ownerAddRewardToken(oARB2.address, vault2.address, true);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);

    // Deposit and step time, assert both tokens accrue consistently
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    await setNextBlockTimestamp(startTime + 5);
    await emitter.updatePool(core.marketIds.weth);
    const acc1a = await emitter.poolAccRewardTokenPerShares(core.marketIds.weth, oARB1.address);
    const acc2a = await emitter.poolAccRewardTokenPerShares(core.marketIds.weth, oARB2.address);
    expect(acc1a).to.eq(acc2a);

    // Disable first reward, advance, ensure only second accrues further
    await emitter.connect(core.governance).ownerDisableRewardToken(oARB1.address);
    await setNextBlockTimestamp(startTime + 15);
    await emitter.updatePool(core.marketIds.weth);
    const acc1b = await emitter.poolAccRewardTokenPerShares(core.marketIds.weth, oARB1.address);
    const acc2b = await emitter.poolAccRewardTokenPerShares(core.marketIds.weth, oARB2.address);
    expect(acc1b).to.eq(acc1a); // frozen
    expect(acc2b).to.gt(acc2a); // continued accrual

    // Remove second reward; then re-add first; ensure accrual resumes
    await emitter.connect(core.governance).ownerRemoveRewardToken(oARB2.address);
    await setNextBlockTimestamp(startTime + 25);
    await emitter.connect(core.governance).ownerEnableRewardToken(oARB1.address);
    await emitter.updatePool(core.marketIds.weth);
    const acc1c = await emitter.poolAccRewardTokenPerShares(core.marketIds.weth, oARB1.address);
    expect(acc1c).to.gt(acc1b);
  });

  it('concurrent deposit/withdraw roundtrips keep rewardDebt and balances consistent', async () => {
    await emitter.connect(core.governance).ownerAddRewardToken(oARB1.address, vault1.address, true);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);

    // Two deposits with time gap, then withdraw half, then all
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    await setNextBlockTimestamp(startTime + 3);
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    // withdraw half
    await emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, wethAmount);
    // withdraw all
    await emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, ethers.constants.MaxUint256);

    await expectProtocolBalance(core, emitter.address, defaultAccountNumber, core.marketIds.weth, ZERO_BI);
    await expectWalletBalance(core.hhUser1.address, oARB1, parseEther('2')); // roughly 2 seconds of accrual * 1 per second
  });

  it('non-standard ERC20 reward should cause payout failure when not using SafeERC20', async () => {
    // Deploy non-standard token and vault; add as reward token
    const NonStandard = await ethers.getContractFactory('NonStandardERC20');
    const nonStandard = await NonStandard.deploy('Bad', 'BAD', core.governance.address, parseEther('1e9'));
    const vault = await createContractWithAbi<MintableStorageVault>(
      MintableStorageVault__factory.abi,
      MintableStorageVault__factory.bytecode,
      [core.dolomiteMargin.address, nonStandard.address],
    );

    await emitter.connect(core.governance).ownerAddRewardToken(nonStandard.address, vault.address, true);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    await setNextBlockTimestamp(startTime + 2);

    // This withdraw attempts to transfer BAD via raw transfer() and should silently fail (token returns false),
    // leaving user without tokens while rewardDebt updates; we assert balance is still zero.
    await emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, ZERO_BI);
    await expectWalletBalance(core.hhUser1.address, nonStandard, ZERO_BI);
  });
});

