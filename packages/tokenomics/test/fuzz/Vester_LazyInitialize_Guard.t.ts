import { expect } from 'chai';
import { ethers } from 'hardhat';
import { createContractWithAbi } from '../../src/utils/dolomite-utils-local';
import {
  VeExternalVesterImplementationV1__factory,
  VeExternalVesterImplementationV2__factory,
} from '../../src/types';

describe('Fuzz: Vester.lazyInitialize guard', () => {
  const core: any = {} as any;
  before(async () => {
    const signers = await ethers.getSigners();
    core.dolomiteMargin = { address: ethers.constants.AddressZero };
    core.dolomiteRegistry = { address: ethers.constants.AddressZero };
    core.testToken = { address: ethers.constants.AddressZero };
    core.hhUser2 = signers[1];
    core.hhUser3 = signers[2];
  });

  it('attacker cannot call lazyInitialize before owner (expected to revert once guard added)', async () => {
    const v1 = await createContractWithAbi(
      VeExternalVesterImplementationV1__factory.abi,
      VeExternalVesterImplementationV1__factory.bytecode,
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, core.testToken.address, 0, core.testToken.address, 0, core.testToken.address, 0],
    );
    // Current behavior: no guard; this will succeed. When guard is added, change to expect revert
    await expect(v1.lazyInitialize(core.hhUser2.address, core.hhUser3.address)).to.not.be.reverted;

    const v2 = await createContractWithAbi(
      VeExternalVesterImplementationV2__factory.abi,
      VeExternalVesterImplementationV2__factory.bytecode,
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, core.testToken.address, 0, core.testToken.address, 0, core.testToken.address, 0],
    );
    await expect(v2.lazyInitialize(core.hhUser2.address, core.hhUser3.address)).to.not.be.reverted;
  });
});

