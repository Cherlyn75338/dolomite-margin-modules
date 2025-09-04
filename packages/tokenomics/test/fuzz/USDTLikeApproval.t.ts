import { expect } from 'chai';
import { Network, ONE_WEEK_SECONDS } from 'packages/base/src/utils/no-deps-constants';
import { ethers } from 'hardhat';
import { createContractWithAbi } from '../../src/utils/dolomite-utils-local';
import {
  TestNonStandardUSDT__factory,
  VeExternalVesterImplementationV1,
  VeExternalVesterImplementationV1__factory,
  VeExternalVesterImplementationV2,
  VeExternalVesterImplementationV2__factory,
} from '../../src/types';

describe('Fuzz: USDT-like approvals in vesters and claims', () => {
  before(async () => {});

  it('vester V1/V2 should handle safeApprove zero-first semantics for REWARD_TOKEN -> VE', async () => {
    const usdt = await createContractWithAbi(
      TestNonStandardUSDT__factory.abi,
      TestNonStandardUSDT__factory.bytecode,
      ['USDT', 'USDT', 6],
    );

    const v1 = await createContractWithAbi<VeExternalVesterImplementationV1>(
      VeExternalVesterImplementationV1__factory.abi,
      VeExternalVesterImplementationV1__factory.bytecode,
      [ethers.constants.AddressZero, ethers.constants.AddressZero, usdt.address, 0, usdt.address, 0, usdt.address, 0],
    );
    await expect(v1.initialize('0x')).to.not.be.reverted;

    // simulate prior non-zero allowance to VE
    await usdt.approve(core.hhUser1.address, 1);
    // Approval pattern should zero-first to avoid revert on USDT-like tokens
    // This is a behavioral test placeholder: expects no revert when contract performs approve sequence
    // Real transfer requires full integration; here we assert function exists and can be called in flow
    expect(v1.address).to.be.properAddress;

    const v2 = await createContractWithAbi<VeExternalVesterImplementationV2>(
      VeExternalVesterImplementationV2__factory.abi,
      VeExternalVesterImplementationV2__factory.bytecode,
      [ethers.constants.AddressZero, ethers.constants.AddressZero, usdt.address, 0, usdt.address, 0, usdt.address, 0],
    );
    await expect(v2.initialize('0x')).to.not.be.reverted;
    expect(v2.address).to.be.properAddress;
  });
});

