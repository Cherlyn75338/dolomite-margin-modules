import { Network, ONE_ETH_BI, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectThrow } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { getDefaultCoreProtocolConfig, setupCoreProtocol, setupWETHBalance } from '@dolomite-exchange/modules-base/test/utils/setup';
import { setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import {
  EmitterMultipleRewardTokens,
  MintableStorageVault,
  OARB,
  TestMaliciousStorageVault,
} from '../src/types';
import { createOARB } from './liquidity-mining-ecosystem-utils';

const defaultAccountNumber = ZERO_BI;
const defaultAllocPoint = BigNumber.from('100');
const wethAmount = BigNumber.from('1003933040428380918');

xdescribe('EmitterMultipleRewardTokens - Reentrancy', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let emitter: EmitterMultipleRewardTokens;
  let o1: OARB;
  let v: MintableStorageVault;
  let malVault: TestMaliciousStorageVault;
  let startTime: number;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
    emitter = await (await ethers.getContractFactory('EmitterMultipleRewardTokens'))
      .connect(core.hhUser1)
      .deploy(core.dolomiteMargin.address, core.dolomiteRegistry.address, ONE_ETH_BI, startTime) as EmitterMultipleRewardTokens;
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);

    o1 = await createOARB(core);
    v = await (await ethers.getContractFactory('MintableStorageVault'))
      .connect(core.hhUser1)
      .deploy(core.dolomiteMargin.address, o1.address) as MintableStorageVault;
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(v.address, true);
    await emitter.connect(core.governance).ownerAddRewardToken(o1.address, v.address, true);

    malVault = await (await ethers.getContractFactory('TestMaliciousStorageVault'))
      .connect(core.hhUser1)
      .deploy() as TestMaliciousStorageVault;
    await emitter.connect(core.governance).ownerAddRewardToken(o1.address, malVault.address, true);

    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
    await setupWETHBalance(core, core.hhUser1, wethAmount, core.dolomiteMargin);
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('attempts reentrancy via malicious vault during withdraw', async () => {
    await setNextBlockTimestamp(startTime + 1);
    const data = emitter.interface.encodeFunctionData('withdraw', [core.marketIds.weth, ZERO_BI]);
    await malVault.setCallback(emitter.address, data);
    await expectThrow(
      emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, ZERO_BI),
      'reentrancy',
    );
  });
});

