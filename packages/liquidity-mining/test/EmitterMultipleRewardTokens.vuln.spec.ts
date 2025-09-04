import {
  createContractWithAbi,
  depositIntoDolomiteMargin,
} from '@dolomite-exchange/modules-base/src/utils/dolomite-utils';
import { Network, ONE_ETH_BI, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import {
  expectProtocolBalance,
  expectThrow,
  expectWalletBalance,
} from '@dolomite-exchange/modules-base/test/utils/assertions';
import {
  disableInterestAccrual,
  getDefaultCoreProtocolConfig,
  setupCoreProtocol,
  setupWETHBalance,
} from '@dolomite-exchange/modules-base/test/utils/setup';
import { setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import {
  TestEmitterMultipleRewardTokensHarness,
  TestEmitterMultipleRewardTokensHarness__factory,
  MintableStorageVault,
  MintableStorageVault__factory,
  OARB,
  NonCompliantMintableERC20,
  NonCompliantMintableERC20__factory,
} from '../src/types';
import { createOARB } from './liquidity-mining-ecosystem-utils';

// This spec intentionally focuses on demonstrating vulnerabilities and edge cases
// in EmitterMultipleRewardTokens, which is not used in production.

describe('EmitterMultipleRewardTokens Vulnerabilities', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;

  let emitter: TestEmitterMultipleRewardTokensHarness;
  let oARB1: OARB;
  let oARB2: OARB;
  let vault1: MintableStorageVault;
  let vault2: MintableStorageVault;
  let startTime: number;

  const defaultAccountNumber = ZERO_BI;
  const defaultAllocPoint = BigNumber.from('100');
  const wethAmount = BigNumber.from('1003933040428380918'); // Makes par value 1 ether

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
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
    startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
    emitter = await createContractWithAbi<TestEmitterMultipleRewardTokensHarness>(
      TestEmitterMultipleRewardTokensHarness__factory.abi,
      TestEmitterMultipleRewardTokensHarness__factory.bytecode,
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, ONE_ETH_BI, startTime],
    );

    await setupWETHBalance(core, core.hhUser1, wethAmount.mul(3), core.dolomiteMargin);
    await depositIntoDolomiteMargin(core, core.hhUser1, defaultAccountNumber, core.marketIds.weth, wethAmount);
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vault1.address, true);
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vault2.address, true);

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('Early-return loop can starve second reward token accrual when supply is zero', async () => {
    await emitter.connect(core.governance).ownerAddRewardToken(oARB1.address, vault1.address, true);
    await emitter.connect(core.governance).ownerAddRewardToken(oARB2.address, vault2.address, true);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, /* _withUpdate */ false);

    // Move time forward and call updatePool while supply == 0
    await setNextBlockTimestamp(startTime + 10);
    await emitter.updatePool(core.marketIds.weth);

    // Vulnerable behavior: lastRewardTime for the first token updated; function returned early;
    // second token's lastRewardTime remains unchanged at startTime
    const last1 = await emitter.poolLastRewardTime(core.marketIds.weth, oARB1.address);
    const last2 = await emitter.poolLastRewardTime(core.marketIds.weth, oARB2.address);
    expect(last1).to.eq(startTime + 10);
    expect(last2).to.eq(startTime); // starved due to early return
  });

  it('Early-return loop can skip second token when first token lastRewardTime >= now', async () => {
    await emitter.connect(core.governance).ownerAddRewardToken(oARB1.address, vault1.address, true);
    await emitter.connect(core.governance).ownerAddRewardToken(oARB2.address, vault2.address, true);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);

    // Set both lastRewardTimes already to next timestamp
    await setNextBlockTimestamp(startTime + 5);
    await emitter.updatePool(core.marketIds.weth); // sets lastRewardTime for oARB1 only due to early return (supply == 0)

    // Now immediately call updatePool again (block.timestamp <= lastRewardTime for oARB1)
    await emitter.updatePool(core.marketIds.weth);

    const last1 = await emitter.poolLastRewardTime(core.marketIds.weth, oARB1.address);
    const last2 = await emitter.poolLastRewardTime(core.marketIds.weth, oARB2.address);
    expect(last1).to.eq(startTime + 5);
    expect(last2).to.eq(startTime); // still untouched
  });

  it('Division-by-zero DoS when totalAllocPoint == 0 and supply > 0', async () => {
    await emitter.connect(core.governance).ownerAddRewardToken(oARB1.address, vault1.address, true);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, /* allocPoint */ 0, false);

    // Deposit to create supply (par increases)
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    await setNextBlockTimestamp(startTime + 1);

    // Call updatePool; reward calculation divides by totalAllocPoint (zero) and should revert
    await expect(emitter.updatePool(core.marketIds.weth)).to.be.reverted;
  });

  it('Unchecked reward payouts with non-compliant ERC20 strand funds and advance debt', async () => {
    // Deploy a non-compliant ERC20 that always returns false on transfer
    const badToken = await createContractWithAbi<NonCompliantMintableERC20>(
      NonCompliantMintableERC20__factory.abi,
      NonCompliantMintableERC20__factory.bytecode,
      [],
    );
    const badVault = await createContractWithAbi<MintableStorageVault>(
      MintableStorageVault__factory.abi,
      MintableStorageVault__factory.bytecode,
      [core.dolomiteMargin.address, badToken.address],
    );

    await emitter.connect(core.governance).ownerAddRewardToken(badToken.address, badVault.address, true);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);

    // Manually set accrual so we can call harnessPayRewards directly
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
    // give user amount and accPerShare to simulate pending = 1e18
    await emitter.harnessSetUserAmount(core.marketIds.weth, core.hhUser1.address, etherToPar(1));
    await emitter.harnessSetUserRewardDebt(core.marketIds.weth, core.hhUser1.address, badToken.address, 0);
    await emitter.harnessSetPoolAccPerShare(core.marketIds.weth, badToken.address, ONE_ETH_BI);
    await emitter.harnessSetPoolTotalPar(core.marketIds.weth, etherToPar(1));
    await setNextBlockTimestamp(startTime + 1);
    await emitter.connect(core.hhUser1).harnessPayRewards(core.marketIds.weth);

    // User received zero BAD tokens because transfer returned false silently
    expect(await badToken.balanceOf(core.hhUser1.address)).to.eq(0);
    // Vault minted tokens but transfer to user failed silently (reward stuck at emitter)
    expect(await badToken.balanceOf(emitter.address)).to.eq(ONE_ETH_BI);
  });

  function etherToPar(v: number): BigNumber {
    // par scaling in tests equals 1e18 for WETH setup; reuse as identity
    return ethers.utils.parseEther(v.toString());
  }
});

