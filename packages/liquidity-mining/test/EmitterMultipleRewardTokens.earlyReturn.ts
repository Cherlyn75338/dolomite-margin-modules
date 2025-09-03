import { Network, ONE_ETH_BI, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectProtocolBalance } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { getDefaultCoreProtocolConfig, setupCoreProtocol, setupWETHBalance } from '@dolomite-exchange/modules-base/test/utils/setup';
import { setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import {
  EmitterMultipleRewardTokens,
  EmitterMultipleRewardTokens__factory,
  MintableStorageVault,
  MintableStorageVault__factory,
  OARB,
} from '../src/types';
import { createOARB } from './liquidity-mining-ecosystem-utils';

const defaultAccountNumber = ZERO_BI;
const defaultAllocPoint = BigNumber.from('100');
const wethAmount = BigNumber.from('1003933040428380918');

xdescribe('EmitterMultipleRewardTokens - Early Return Accrual', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let emitter: EmitterMultipleRewardTokens;
  let o1: OARB;
  let o2: OARB;
  let v1: MintableStorageVault;
  let v2: MintableStorageVault;
  let startTime: number;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    o1 = await createOARB(core);
    o2 = await createOARB(core);
    v1 = await (await ethers.getContractFactory('MintableStorageVault'))
      .connect(core.hhUser1)
      .deploy(core.dolomiteMargin.address, o1.address) as MintableStorageVault;
    v2 = await (await ethers.getContractFactory('MintableStorageVault'))
      .connect(core.hhUser1)
      .deploy(core.dolomiteMargin.address, o2.address) as MintableStorageVault;
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(v1.address, true);
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(v2.address, true);

    startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
    emitter = await (await ethers.getContractFactory('EmitterMultipleRewardTokens'))
      .connect(core.hhUser1)
      .deploy(core.dolomiteMargin.address, core.dolomiteRegistry.address, ONE_ETH_BI, startTime) as EmitterMultipleRewardTokens;
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);

    await emitter.connect(core.governance).ownerAddRewardToken(o1.address, v1.address, true);
    await emitter.connect(core.governance).ownerAddRewardToken(o2.address, v2.address, true);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);

    await setupWETHBalance(core, core.hhUser1, wethAmount, core.dolomiteMargin);
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    await expectProtocolBalance(
      core,
      emitter.address,
      BigNumber.from(core.hhUser1.address),
      core.marketIds.weth,
      wethAmount,
    );
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('updates both tokens when first token lastRewardTime == now', async () => {
    await setNextBlockTimestamp(startTime + 1);
    await emitter.updatePool(core.marketIds.weth);
    const last1 = await emitter.poolLastRewardTime(core.marketIds.weth, o1.address);
    const last2 = await emitter.poolLastRewardTime(core.marketIds.weth, o2.address);
    expect(last1).to.eq(startTime + 1);
    expect(last2).to.eq(startTime + 1);
  });

  it('still updates second token when supply is zero for first check', async () => {
    // Withdraw all to make supply zero
    await setNextBlockTimestamp(startTime + 1);
    await emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, wethAmount);
    await setNextBlockTimestamp(startTime + 2);
    await emitter.updatePool(core.marketIds.weth);
    const last1 = await emitter.poolLastRewardTime(core.marketIds.weth, o1.address);
    const last2 = await emitter.poolLastRewardTime(core.marketIds.weth, o2.address);
    expect(last1).to.eq(startTime + 2);
    expect(last2).to.eq(startTime + 2);
  });
});

