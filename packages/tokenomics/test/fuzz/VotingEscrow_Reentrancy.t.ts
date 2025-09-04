import { expect } from 'chai';
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;
// Local lightweight helpers to avoid external RPC dependencies
import { ethers } from 'hardhat';
import { createContractWithAbi, createTestToken } from '../../src/utils/dolomite-utils-local';
import { increase } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import {
  MaliciousERC721Receiver__factory,
  VoterAlwaysActive__factory,
  VotingEscrow,
  VeFeeCalculator,
} from '../../src/types';
import { createVeFeeCalculator, createVotingEscrow } from '../../src/utils/dolomite-utils-local';

describe('Fuzz: VotingEscrow ERC721 receiver reentrancy', () => {
  const core: any = {} as any;
  let ve: VotingEscrow;
  let feeCalc: VeFeeCalculator;

  before(async () => {
    core.hhUser1 = (await ethers.getSigners())[0];
    core.hhUser5 = (await ethers.getSigners())[1];
    core.hhUser6 = (await ethers.getSigners())[2];
    const token = await createTestToken();
    const voter = await createContractWithAbi(VoterAlwaysActive__factory.abi, VoterAlwaysActive__factory.bytecode, []);
    feeCalc = await createVeFeeCalculator();
    ve = await createVotingEscrow(token, voter.address, feeCalc, core.hhUser5.address, core.hhUser6.address);

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
    await expect(
      ve
        .connect(core.hhUser1)
        ['safeTransferFrom(address,address,uint256)'](core.hhUser1.address, attacker.address, tokenId),
    ).to.not.be.reverted;
  });
});

