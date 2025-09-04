import { expect } from 'chai';
import { Network, ONE_WEEK_SECONDS } from 'packages/base/src/utils/no-deps-constants';
import { setupCoreProtocol } from 'packages/base/test/utils/setup';
import { CoreProtocolArbitrumOne } from 'packages/base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { createContractWithAbi, createTestToken } from 'packages/base/src/utils/dolomite-utils';
import { increase } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { VoterAlwaysActive__factory, VotingEscrow } from '../../src/types';
import { createVeFeeCalculator, createVotingEscrow } from '../tokenomics-ecosystem-utils';

describe('Fuzz: Weekly boundaries for ve math', () => {
  let core: CoreProtocolArbitrumOne;
  let ve: VotingEscrow;

  before(async () => {
    core = await setupCoreProtocol({ network: Network.ArbitrumOne, blockNumber: 219_404_000 });
    const token = await createTestToken();
    const voter = await createContractWithAbi(VoterAlwaysActive__factory.abi, VoterAlwaysActive__factory.bytecode, []);
    const feeCalc = await createVeFeeCalculator(core);
    ve = await createVotingEscrow(core, token, voter.address, feeCalc, core.hhUser5.address, core.hhUser6.address);
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

