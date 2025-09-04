import { expect } from 'chai';
import { revertToSnapshotAndCapture, snapshot } from '../utils';
import { setupCoreProtocol } from '../utils/setup';
import { CoreProtocolArbitrumOne } from '../utils/core-protocols/core-protocol-arbitrum-one';
import { getSimpleZapParams } from '../utils/zap-utils';
import { TraderType } from '../../src/types';

describe('LiquidatorProxyV6.fuzz', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;

  before(async () => {
    core = await setupCoreProtocol();
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('rejects unwhitelisted internal trader types and handles external trader revert without partial state', async () => {
    const params = await getSimpleZapParams(core);
    // craft an internal trader not whitelisted
    params.tradersPath[0].traderType = TraderType.InternalLiquidity;
    params.tradersPath[0].trader = core.hhUser5.address; // not whitelisted
    await expect(
      core.liquidatorProxyV6.connect(core.hhUser1).liquidate(params),
    ).to.be.revertedWith('GenericTraderProxyBase: Internal trader not whitelisted');
  });

  it('enforces _inputAmountWei == max for isolation wrapper/unwrapper', async () => {
    const params = await getSimpleZapParams(core);
    // set trader to wrapper type at index 0 to trigger Isolation check
    params.tradersPath[0].traderType = TraderType.IsolationModeWrapper;
    params.inputAmountWei = 12345; // not max
    await expect(
      core.liquidatorProxyV6.connect(core.hhUser1).liquidate(params),
    ).to.be.revertedWith('LiquidatorProxyV6: Invalid amount for IsolationMode');
  });
});

