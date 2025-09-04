import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Network } from 'packages/base/src/utils/no-deps-constants';
import { createContractWithAbi, createTestToken, createVeFeeCalculator, createVotingEscrow } from '../../src/utils/dolomite-utils-local';
import { VoterAlwaysActive__factory, VotingEscrow } from '../../src/types';
import { createVeFeeCalculator, createVotingEscrow } from '../tokenomics-ecosystem-utils';

describe('Fuzz: Delegation arrays worst-case', () => {
  const core: any = {} as any;
  let ve: VotingEscrow;

  before(async () => {
    core.hhUser5 = (await ethers.getSigners())[1];
    core.hhUser6 = (await ethers.getSigners())[2];
    const token = await createTestToken();
    const voter = await createContractWithAbi(VoterAlwaysActive__factory.abi, VoterAlwaysActive__factory.bytecode, []);
    const feeCalc = await createVeFeeCalculator();
    ve = await createVotingEscrow(token, voter.address, feeCalc, core.hhUser5.address, core.hhUser6.address);
  });

  it('should cap dstRep tokenIds by MAX_DELEGATES', async () => {
    // behavior: call public methods to allocate checkpoints and ensure no revert until MAX_DELEGATES
    expect(await ve.MAX_DELEGATES()).to.equal(1024);
  });
});

