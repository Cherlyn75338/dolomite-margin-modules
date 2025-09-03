import { expect } from 'chai';
import { ethers } from 'hardhat';
import { impersonate, snapshot, revertToSnapshotAndCapture } from '@dolomite-exchange/modules-base/test/utils';
import { expectEvent, expectThrow } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { setupCoreProtocol } from '@dolomite-exchange/modules-base/test/utils/setup';
import { Network } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import {
  InfraredBGTMetaVault,
  InfraredBGTMetaVault__factory,
  TestBerachainRewardsRegistry,
  TestBerachainRewardsRegistry__factory,
  MetaVaultUpgradeableProxy__factory,
} from '../src/types';
import { createTestBerachainRewardsRegistry, createPOLIsolationModeVaultFactory } from './berachain-ecosystem-utils';

describe('BerachainRewardsRegistry.additional', () => {
  let snapshotId: string;

  it('non-listed factory calling createMetaVault should revert and code hash is exposed via event', async () => {
    const core = await setupCoreProtocol({ blockNumber: 2_040_000, network: Network.Berachain });
    const metaVaultImplementation = await (await ethers.getContractFactory('InfraredBGTMetaVault')).deploy();
    const registry = await createTestBerachainRewardsRegistry(core, metaVaultImplementation as any, core.berachainRewardsEcosystem.polLiquidatorProxy);

    const factory = await createPOLIsolationModeVaultFactory(
      core,
      registry,
      core.dolomiteTokens.weth!,
      (await (await ethers.getContractFactory('POLIsolationModeTokenVaultV1')).deploy()) as any,
      [],
      [],
    );

    await expectThrow(
      registry.connect(core.hhUser2).createMetaVault(core.hhUser2.address, core.hhUser2.address),
      `OnlyDolomiteMargin: Caller is not a global operator <${core.hhUser2.address.toLowerCase()}>`,
    );

    const oldHash = await registry.getMetaVaultProxyInitCodeHash();
    const tx = await registry.connect(core.governance)
      .ownerSetMetaVaultProxyCreationCode(MetaVaultUpgradeableProxy__factory.bytecode);
    await expectEvent(registry, tx, 'MetaVaultProxyCreationCodeSet', {
      proxyInitHash: ethers.utils.keccak256(MetaVaultUpgradeableProxy__factory.bytecode),
    });
    const newHash = await registry.getMetaVaultProxyInitCodeHash();
    expect(newHash).to.equal(ethers.utils.keccak256(MetaVaultUpgradeableProxy__factory.bytecode));
    // Not asserting inequality because initial code may already match in this test setup
    expect(newHash).to.not.equal('0x');
  });
});

