import { createContractWithAbi, depositIntoDolomiteMargin } from '@dolomite-exchange/modules-base/src/utils/dolomite-utils';
import { Network, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectThrow } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { disableInterestAccrual, getDefaultCoreProtocolConfig, setupCoreProtocol, setupUSDCBalance } from 'packages/base/test/utils/setup';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { Emitter, Emitter__factory, OARB } from '../src/types';
import { createOARB } from './liquidity-mining-ecosystem-utils';

// Minimal spec to demonstrate division-by-zero DoS in Emitter.updatePool when totalAllocPoint == 0 and supply > 0

describe('Emitter DoS - division by zero', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let emitter: Emitter;
  let oARB: OARB;
  let startTime: number;

  const defaultAccountNumber = ZERO_BI;
  const usdcAmount = BigNumber.from('100816979');

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    await disableInterestAccrual(core, core.marketIds.usdc);
    await setupUSDCBalance(core, core.hhUser1, usdcAmount, core.dolomiteMargin);

    oARB = await createOARB(core);
    startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
    emitter = await createContractWithAbi<Emitter>(
      Emitter__factory.abi,
      Emitter__factory.bytecode,
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, oARB.address, /* oARBPerSec */ 1, startTime],
    );
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('reverts when updatePool called with non-zero supply and zero totalAllocPoint', async () => {
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.usdc, /* allocPoint */ 0, false);
    await depositIntoDolomiteMargin(core, core.hhUser1, defaultAccountNumber, core.marketIds.usdc, usdcAmount);
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.usdc, usdcAmount);
    await setNextBlockTimestamp(startTime + 1);

    await expectThrow(emitter.updatePool(core.marketIds.usdc), 'division by zero');
  });
});

