import { expect } from 'chai';
import { Network, ONE_WEEK_SECONDS } from 'packages/base/src/utils/no-deps-constants';
import { setupCoreProtocol } from 'packages/base/test/utils/setup';
import { CoreProtocolArbitrumOne } from 'packages/base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { createContractWithAbi, createTestToken } from 'packages/base/src/utils/dolomite-utils';
import { increase } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import {
  MaliciousERC721Receiver__factory,
  VoterAlwaysActive__factory,
  VotingEscrow,
  VeFeeCalculator,
} from '../../src/types';
import { createVeFeeCalculator, createVotingEscrow } from '../tokenomics-ecosystem-utils';

describe('Fuzz: VotingEscrow ERC721 receiver reentrancy', () => {
  let core: CoreProtocolArbitrumOne;
  let ve: VotingEscrow;
  let feeCalc: VeFeeCalculator;

  before(async () => {
    core = await setupCoreProtocol({ network: Network.ArbitrumOne, blockNumber: 219_404_000 });
    const token = await createTestToken();
    const voter = await createContractWithAbi(VoterAlwaysActive__factory.abi, VoterAlwaysActive__factory.bytecode, []);
    feeCalc = await createVeFeeCalculator(core);
    ve = await createVotingEscrow(core, token, voter.address, feeCalc, core.hhUser5.address, core.hhUser6.address);

    await token.addBalance(core.hhUser1.address, 1_000_000);
    await token.connect(core.hhUser1).approve(ve.address, 1_000_000);
  });

  it('should not be vulnerable to reentrancy during safeTransferFrom', async () => {
    const attacker = await createContractWithAbi(
      MaliciousERC721Receiver__factory.abi,
      MaliciousERC721Receiver__factory.bytecode,
      [ve.address],
    );

    const id = await ve.connect(core.hhUser1).create_lock(1000, ONE_WEEK_SECONDS * 10);
    const tokenId = (await id).toNumber ? (await id).toNumber() : 1;

    await attacker.setAttack(0, 0); // None
    await expect(ve.connect(core.hhUser1).safeTransferFrom(core.hhUser1.address, attacker.address, tokenId)).to.not.be
      .reverted;

    // Withdraw attack
    await increase(ONE_WEEK_SECONDS * 10);
    await attacker.setAttack(1, tokenId);
    await expect(ve.connect(core.hhUser1).safeTransferFrom(attacker.address, core.hhUser1.address, tokenId)).to.not.be
      .reverted;
  });
});

