import { expect } from 'chai';
import { setupCoreProtocol } from 'packages/base/test/utils/setup';
import { CoreProtocolArbitrumOne } from 'packages/base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { Network } from 'packages/base/src/utils/no-deps-constants';
import { createVeFeeCalculator } from '../tokenomics-ecosystem-utils';

describe('Fuzz: VeFeeCalculator extremes', () => {
  let core: CoreProtocolArbitrumOne;

  before(async () => {
    core = await setupCoreProtocol({ network: Network.ArbitrumOne, blockNumber: 219_404_000 });
  });

  it('owner can set burn fee and buyback split within expected ranges', async () => {
    const calc = await createVeFeeCalculator(core);
    await expect(calc.connect(core.governance).ownerSetBurnFee(0)).to.not.be.reverted;
    await expect(calc.connect(core.governance).ownerSetBurnFee('1000000000000000000')).to.not.be.reverted; // 100%

    // set split to 0 and 100%
    await expect(calc.connect(core.governance).ownerSetBuybackFeeSplit({ value: 0 })).to.not.be.reverted;
    await expect(calc.connect(core.governance).ownerSetBuybackFeeSplit({ value: '1000000000000000000' })).to.not.be
      .reverted;
  });
});

