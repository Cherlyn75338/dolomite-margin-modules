import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import {
  GLPIsolationModeTokenVaultV2,
  GLPIsolationModeTokenVaultV2__factory,
  TestGmxRewardsRouterV2Reentrant__factory,
} from '../src/types';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { getDefaultCoreProtocolConfig, setupCoreProtocol } from '../../base/test/utils/setup';
import { Network, ZERO_BI } from '../../base/src/utils/no-deps-constants';
import { revertToSnapshotAndCapture, snapshot } from '../../base/test/utils';

describe('GLPIsolationModeTokenVaultV2.reentrancy', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let vault: GLPIsolationModeTokenVaultV2;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    vault = await ethers.getContractAt<GLPIsolationModeTokenVaultV2>(
      'GLPIsolationModeTokenVaultV2',
      core.gmxEcosystem.glpVaultV2.address,
    );

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('reverts when reward router reenters executeDepositIntoVault with shouldSkipTransfer set', async () => {
    const reentrant = await (await new TestGmxRewardsRouterV2Reentrant__factory(core.hhUser1).deploy()).deployed();
    // point registry to malicious router for test user
    await core.gmxEcosystem.setRewardRouterForVault(core.hhUser1.address, reentrant.address);

    await expect(
      vault.connect(core.hhUser1).signalAccountTransfer(core.hhUser2.address, BigNumber.from('1')),
    ).to.be.reverted;
  });
});

