import { expect } from 'chai';
import { setupCoreProtocol } from 'packages/base/test/utils/setup';
import { CoreProtocolArbitrumOne } from 'packages/base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { Network } from 'packages/base/src/utils/no-deps-constants';
import { createContractWithAbi, createTestToken } from 'packages/base/src/utils/dolomite-utils';
import { VoterAlwaysActive__factory, VotingEscrow } from '../../src/types';
import { createVeFeeCalculator, createVotingEscrow } from '../tokenomics-ecosystem-utils';

describe('Fuzz: Delegation arrays worst-case', () => {
  let core: CoreProtocolArbitrumOne;
  let ve: VotingEscrow;

  before(async () => {
    core = await setupCoreProtocol({ network: Network.ArbitrumOne, blockNumber: 219_404_000 });
    const token = await createTestToken();
    const voter = await createContractWithAbi(VoterAlwaysActive__factory.abi, VoterAlwaysActive__factory.bytecode, []);
    const feeCalc = await createVeFeeCalculator(core);
    ve = await createVotingEscrow(core, token, voter.address, feeCalc, core.hhUser5.address, core.hhUser6.address);
  });

  it('should cap dstRep tokenIds by MAX_DELEGATES', async () => {
    // behavior: call public methods to allocate checkpoints and ensure no revert until MAX_DELEGATES
    expect(await ve.MAX_DELEGATES()).to.equal(1024);
  });
});

