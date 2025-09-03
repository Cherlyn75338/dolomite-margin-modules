import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { revertToSnapshotAndCapture, snapshot } from 'packages/base/test/utils';

describe('Berachain comprehensive tests (scaffold)', () => {
  let snapshotId: string;

  before(async () => {
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('iBGT zero-first token behavior', async () => {
    const [user, other] = await ethers.getSigners();
    const ZeroFirst = await ethers.getContractFactory('MockERC20ZeroFirst');
    const token = await ZeroFirst.deploy('iBGT', 'iBGT');
    await token.deployed();
    await token.mint(user.address, 100);
    await token.connect(user).approve(other.address, 10);
    await expect(token.connect(user).approve(other.address, 1)).to.be.revertedWith('ZeroFirst: approve non-zero->non-zero');
  });
});

