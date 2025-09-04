import { expect } from 'chai';
import { createVeFeeCalculator } from '../../src/utils/dolomite-utils-local';

describe('Fuzz: VeFeeCalculator extremes', () => {
  before(async () => {});

  it('owner can set burn fee and buyback split within expected ranges', async () => {
    const calc = await createVeFeeCalculator();
    await expect(calc.ownerSetBurnFee(0)).to.not.be.reverted;
    await expect(calc.ownerSetBurnFee('1000000000000000000')).to.not.be.reverted; // 100%

    // set split to 0 and 100%
    await expect(calc.ownerSetBuybackFeeSplit({ value: 0 })).to.not.be.reverted;
    await expect(calc.ownerSetBuybackFeeSplit({ value: '1000000000000000000' })).to.not.be
      .reverted;
  });
});

