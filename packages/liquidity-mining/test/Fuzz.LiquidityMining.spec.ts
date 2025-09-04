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
  setupARBBalance,
  setupCoreProtocol,
  setupUSDCBalance,
  setupWETHBalance,
} from '@dolomite-exchange/modules-base/test/utils/setup';
import { setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import {
  Emitter,
  Emitter__factory,
  EmitterMultipleRewardTokens,
  EmitterMultipleRewardTokens__factory,
  MintableStorageVault,
  MintableStorageVault__factory,
} from '../src/types';
import { createOARB } from './liquidity-mining-ecosystem-utils';

// New mocks
import { FalseReturnERC20__factory, NoReturnERC20__factory, ReentrantStorageVault__factory } from '../src/types';

const defaultAccountNumber = ZERO_BI;
const defaultAllocPoint = BigNumber.from('100');
const wethAmount = BigNumber.from('1003933040428380918');
const wethParAmount = BigNumber.from('1000000000000000000');

describe('Fuzz.LiquidityMining', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    await disableInterestAccrual(core, core.marketIds.usdc);
    await disableInterestAccrual(core, core.marketIds.weth);
    await disableInterestAccrual(core, core.marketIds.arb!);

    await setupUSDCBalance(core, core.hhUser1, BigNumber.from('100816979').mul(3), core.dolomiteMargin);
    await setupWETHBalance(core, core.hhUser1, wethAmount.mul(3), core.dolomiteMargin);
    await depositIntoDolomiteMargin(core, core.hhUser1, defaultAccountNumber, core.marketIds.weth, wethAmount.mul(3));

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  describe('EmitterMultipleRewardTokens - accrual across tokens with varied timestamps', () => {
    it('updates all tokens even if first one skips', async () => {
      const startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
      const emitter = await createContractWithAbi<EmitterMultipleRewardTokens>(
        EmitterMultipleRewardTokens__factory.abi,
        EmitterMultipleRewardTokens__factory.bytecode,
        [core.dolomiteMargin.address, core.dolomiteRegistry.address, ONE_ETH_BI, startTime],
      );

      // Two reward tokens with separate vaults
      const oARB1 = await createOARB(core);
      const oARB2 = await createOARB(core);
      const vault1 = await createContractWithAbi<MintableStorageVault>(
        MintableStorageVault__factory.abi,
        MintableStorageVault__factory.bytecode,
        [core.dolomiteMargin.address, oARB1.address],
      );
      const vault2 = await createContractWithAbi<MintableStorageVault>(
        MintableStorageVault__factory.abi,
        MintableStorageVault__factory.bytecode,
        [core.dolomiteMargin.address, oARB2.address],
      );
      await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);
      await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vault1.address, true);
      await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vault2.address, true);

      await emitter.connect(core.governance).ownerAddRewardToken(oARB1.address, vault1.address, true);
      await emitter.connect(core.governance).ownerAddRewardToken(oARB2.address, vault2.address, true);
      await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);

      // Make supply > 0
      await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);

      // Move time so update is due; then set lastRewardTime for first token == now to force skip
      const now = startTime + 100;
      await setNextBlockTimestamp(now);
      await emitter.updatePool(core.marketIds.weth);
      // At this point, both should be updated to now
      expect(await emitter.poolLastRewardTime(core.marketIds.weth, oARB1.address)).to.eq(now);
      expect(await emitter.poolLastRewardTime(core.marketIds.weth, oARB2.address)).to.eq(now);

      // Move time again, manually set token1 lastRewardTime to current block to simulate 1st skipping branch
      const later = now + 10;
      await setNextBlockTimestamp(later);
      // Call update again; both should update regardless of token1 skip condition
      await emitter.updatePool(core.marketIds.weth);
      expect(await emitter.poolLastRewardTime(core.marketIds.weth, oARB1.address)).to.eq(later);
      expect(await emitter.poolLastRewardTime(core.marketIds.weth, oARB2.address)).to.eq(later);
    });
  });

  describe('EmitterMultipleRewardTokens - non-standard ERC20 payouts', () => {
    it('reverts on false-return token transfers', async () => {
      const startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
      const emitter = await createContractWithAbi<EmitterMultipleRewardTokens>(
        EmitterMultipleRewardTokens__factory.abi,
        EmitterMultipleRewardTokens__factory.bytecode,
        [core.dolomiteMargin.address, core.dolomiteRegistry.address, ONE_ETH_BI, startTime],
      );

      const falseToken = await createContractWithAbi(
        FalseReturnERC20__factory.abi,
        FalseReturnERC20__factory.bytecode,
        [],
      );

      // Mint some to a vault that will transfer to users
      const reentrantVault = await createContractWithAbi(
        ReentrantStorageVault__factory.abi,
        ReentrantStorageVault__factory.bytecode,
        [falseToken.address],
      );

      await falseToken.mint(reentrantVault.address, parseEther('1000'));
      await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);

      await emitter.connect(core.governance).ownerAddRewardToken(falseToken.address, reentrantVault.address, true);
      await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
      await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);

      await setNextBlockTimestamp(startTime + 5);
      await expectThrow(
        emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, ZERO_BI),
        'SafeERC20: ERC20 operation did not succeed',
      );
    });

    it('handles no-return tokens via SafeERC20 (by not reverting on transfer for standard tokens)', async () => {
      const startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
      const emitter = await createContractWithAbi<EmitterMultipleRewardTokens>(
        EmitterMultipleRewardTokens__factory.abi,
        EmitterMultipleRewardTokens__factory.bytecode,
        [core.dolomiteMargin.address, core.dolomiteRegistry.address, ONE_ETH_BI, startTime],
      );

      const noReturnToken = await createContractWithAbi(
        NoReturnERC20__factory.abi,
        NoReturnERC20__factory.bytecode,
        [],
      );
      const vault = await createContractWithAbi(
        ReentrantStorageVault__factory.abi,
        ReentrantStorageVault__factory.bytecode,
        [noReturnToken.address],
      );
      await noReturnToken.mint(vault.address, parseEther('1000'));

      await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);
      await emitter.connect(core.governance).ownerAddRewardToken(noReturnToken.address, vault.address, true);
      await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
      await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);

      await setNextBlockTimestamp(startTime + 5);
      // If SafeERC20 is used, no-return tokens should be supported and not revert
      await emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, ZERO_BI);
      await expectWalletBalance(core.hhUser1.address, noReturnToken, ONE_ETH_BI);
    });
  });

  describe('Emitter - totalAllocPoint == 0 guard', () => {
    it('does not revert and advances timestamps when alloc points are zero', async () => {
      const startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
      const oARB = await createOARB(core);
      const emitter = await createContractWithAbi<Emitter>(
        Emitter__factory.abi,
        Emitter__factory.bytecode,
        [core.dolomiteMargin.address, core.dolomiteRegistry.address, oARB.address, ONE_ETH_BI, startTime],
      );
      await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);
      await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
      // set totalAllocPoint to 0
      await emitter.connect(core.governance).ownerSetPool(core.marketIds.weth, 0);

      // create supply
      await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);

      const t1 = startTime + 10;
      await setNextBlockTimestamp(t1);
      // Must not revert even though totalAllocPoint == 0 and supply > 0
      await emitter.updatePool(core.marketIds.weth);

      // lastRewardTime should be advanced
      const info = await emitter.poolInfo(core.marketIds.weth);
      expect(info.lastRewardTime).to.eq(t1);
      // acc per share should remain zero, no division occurred
      expect(info.accOARBPerShare).to.eq(ZERO_BI);
    });
  });
});

