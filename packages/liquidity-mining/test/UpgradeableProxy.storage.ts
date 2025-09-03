import { createContractWithAbi, createContractWithLibrary } from '@dolomite-exchange/modules-base/src/utils/dolomite-utils';
import { Network } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectThrow } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { getDefaultCoreProtocolConfig, setupCoreProtocol } from '@dolomite-exchange/modules-base/test/utils/setup';
import { expect } from 'chai';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { TestVesterImplementationV2, TestVesterImplementationV2__factory, UpgradeableProxy, UpgradeableProxy__factory, VesterImplementationLibForV2, VesterImplementationLibForV2__factory } from '../src/types';
import { createSafeDelegateLibrary } from 'packages/base/test/utils/ecosystem-utils/general';

// Storage slot collision smoke test across upgrades

describe('UpgradeableProxy.storage', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let proxy: UpgradeableProxy;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    const library = await createContractWithAbi<VesterImplementationLibForV2>(
      VesterImplementationLibForV2__factory.abi,
      VesterImplementationLibForV2__factory.bytecode,
      [],
    );
    const safeDelegate = await createSafeDelegateLibrary();
    const impl1 = await createContractWithLibrary<TestVesterImplementationV2>(
      'TestVesterImplementationV2',
      { VesterImplementationLibForV2: library.address, SafeDelegateCallLib: safeDelegate.address },
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, core.tokens.weth.address, core.tokens.arb!.address],
    );
    const initData = await impl1.populateTransaction.initialize(defaultAbiCoder.encode(['address'], [core.hhUser1.address]));
    proxy = await createContractWithAbi<UpgradeableProxy>(
      UpgradeableProxy__factory.abi,
      UpgradeableProxy__factory.bytecode,
      [impl1.address, core.dolomiteMargin.address, initData.data!],
    );
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('upgrades do not corrupt critical state (reads still succeed post-upgrade)', async () => {
    const vester = TestVesterImplementationV2__factory.connect(proxy.address, core.hhUser1);
    const before = await Promise.all([
      vester.DOLOMITE_MARGIN(),
      vester.oToken(),
      vester.levelRequestFee(),
    ]);

    // Upgrade to new impl and ensure values still readable
    const library = await createContractWithAbi<VesterImplementationLibForV2>(
      VesterImplementationLibForV2__factory.abi,
      VesterImplementationLibForV2__factory.bytecode,
      [],
    );
    const safeDelegate = await createSafeDelegateLibrary();
    const impl2 = await createContractWithLibrary<TestVesterImplementationV2>(
      'TestVesterImplementationV2',
      { VesterImplementationLibForV2: library.address, SafeDelegateCallLib: safeDelegate.address },
      [core.dolomiteMargin.address, core.dolomiteRegistry.address, core.tokens.weth.address, core.tokens.arb!.address],
    );
    await proxy.connect(core.governance).upgradeTo(impl2.address);

    const after = await Promise.all([
      vester.DOLOMITE_MARGIN(),
      vester.oToken(),
      vester.levelRequestFee(),
    ]);
    expect(after[0]).to.eq(before[0]);
    expect(after[1]).to.eq(before[1]);
    expect(after[2]).to.eq(before[2]);
  });

  it('rejects upgrade to non-contract', async () => {
    await expectThrow(
      proxy.connect(core.governance).upgradeTo(core.hhUser1.address),
      'UpgradeableProxy: Implementation is not a contract',
    );
  });
});

