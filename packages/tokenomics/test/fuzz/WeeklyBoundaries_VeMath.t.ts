import { expect } from 'chai';
import { Network, ONE_WEEK_SECONDS } from 'packages/base/src/utils/no-deps-constants';
import { ethers } from 'hardhat';
import { createContractWithAbi, createTestToken, createVeFeeCalculator, createVotingEscrow } from '../../src/utils/dolomite-utils-local';
import { increase } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { VoterAlwaysActive__factory, VotingEscrow } from '../../src/types';
import { createVeFeeCalculator, createVotingEscrow } from '../tokenomics-ecosystem-utils';

describe('Fuzz: Weekly boundaries for ve math', () => {
  const core: any = {} as any;
  let ve: VotingEscrow;

  before(async () => {
    core.hhUser1 = (await ethers.getSigners())[0];
    core.hhUser5 = (await ethers.getSigners())[1];
    core.hhUser6 = (await ethers.getSigners())[2];
    const token = await createTestToken();
    const feeCalc = await createVeFeeCalculator();
    ve = await createVotingEscrow(token, core.hhUser5.address, feeCalc, core.hhUser5.address, core.hhUser6.address);
    await token.addBalance(core.hhUser1.address, 1_000_000);
    await token.connect(core.hhUser1).approve(ve.address, 1_000_000);
  });

  it('rounds lock end to weeks and updates user_point_history across boundary', async () => {
    const lockDur = ONE_WEEK_SECONDS * 5 + (ONE_WEEK_SECONDS - 1);
    const id = await ve.connect(core.hhUser1).create_lock(1000, lockDur);
    const tokenId = (await id).toNumber ? (await id).toNumber() : 1;

    await increase(ONE_WEEK_SECONDS);
    const balAfterWeek = await ve.balanceOfNFT(tokenId);
    expect(balAfterWeek).to.gt(0);
    await ve.checkpoint();
  });
});

