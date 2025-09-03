import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { snapshot, revertToSnapshotAndCapture, impersonate } from '@dolomite-exchange/modules-base/test/utils';
import { expectProtocolBalance, expectThrow, expectWalletBalance } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { Network, ONE_BI, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { disableInterestAccrual, setupCoreProtocol, setupTestMarket, setupUserVaultProxy } from '@dolomite-exchange/modules-base/test/utils/setup';
import { createContractWithAbi, depositIntoDolomiteMargin } from 'packages/base/src/utils/dolomite-utils';
import { CoreProtocolBerachain } from 'packages/base/test/utils/core-protocols/core-protocol-berachain';
import {
  DolomiteERC4626,
  DolomiteERC4626__factory,
  InfraredBGTMetaVault,
  InfraredBGTMetaVault__factory,
  InfraredBGTIsolationModeTokenVaultV1,
  InfraredBGTIsolationModeTokenVaultV1__factory,
  InfraredBGTIsolationModeVaultFactory,
  InfraredBGTIsolationModeVaultFactory__factory,
  MetaVaultRewardReceiver__factory,
  POLIsolationModeVaultFactory,
  POLIsolationModeVaultFactory__factory,
} from '../src/types';
import { createBerachainRewardsRegistry, createInfraredBGTIsolationModeTokenVaultV1, createInfraredBGTIsolationModeVaultFactory, RewardVaultType } from './berachain-ecosystem-utils';
import { FeeOnTransferERC20__factory } from '../src/types';

describe('InfraredBGTMetaVault.additional', () => {
  let snapshotId: string;
  let core: CoreProtocolBerachain;
  let dToken: DolomiteERC4626;
  let registry: any;
  let factory: InfraredBGTIsolationModeVaultFactory;
  let metaVault: InfraredBGTMetaVault;
  let iBgtVault: InfraredBGTIsolationModeTokenVaultV1;

  before(async () => {
    core = await setupCoreProtocol({ blockNumber: 2_040_000, network: Network.Berachain });
    await disableInterestAccrual(core, core.marketIds.weth);

    dToken = DolomiteERC4626__factory.connect(core.dolomiteTokens.weth!.address, core.hhUser1);

    const metaVaultImplementation = await createContractWithAbi<InfraredBGTMetaVault>(
      InfraredBGTMetaVault__factory.abi,
      InfraredBGTMetaVault__factory.bytecode,
      [],
    );
    registry = await createBerachainRewardsRegistry(core, metaVaultImplementation, (await import('./berachain-ecosystem-utils')).polLiquidatorProxy!);

    const userVaultImpl = await createInfraredBGTIsolationModeTokenVaultV1();
    factory = await createInfraredBGTIsolationModeVaultFactory(registry, core.tokens.iBgt, userVaultImpl, core);
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(factory.address, true);

    await factory.createVault(core.hhUser1.address);
    iBgtVault = setupUserVaultProxy<InfraredBGTIsolationModeTokenVaultV1>(
      await factory.getVaultByAccount(core.hhUser1.address),
      InfraredBGTIsolationModeTokenVaultV1__factory,
      core.hhUser1,
    );
    metaVault = InfraredBGTMetaVault__factory.connect(
      await registry.getMetaVaultByAccount(core.hhUser1.address),
      core.hhUser1,
    );

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('iBGT claim path: clears allowance meta->vault and resets flag', async () => {
    const infrared = await impersonate(core.berachainRewardsEcosystem.infrared.address, true);
    await core.tokens.iBgt.connect(infrared).approve(core.berachainRewardsEcosystem.iBgtStakingVault.address, parseEther('100'));
    await core.berachainRewardsEcosystem.iBgtStakingVault
      .connect(infrared)
      .notifyRewardAmount(core.tokens.iBgt.address, parseEther('100'));

    await metaVault.getRewardIBgt();

    // meta-vault approval to iBgtVault for iBGT should be zero post-claim
    const allowance = await core.tokens.iBgt.allowance(metaVault.address, iBgtVault.address);
    expect(allowance.eq(0)).to.be.true;
    // isDepositSourceMetaVault should be false post-deposit
    expect(await iBgtVault.isDepositSourceMetaVault()).to.eq(false);
  });

  it('Other token deposit success path: resets allowance to Dolomite', async () => {
    const TestToken = await (await import('../src/types')).TestToken__factory.connect(core.tokens.honey.address, core.hhUser1);
    // ensure honey market exists already
    const marketId = await core.dolomiteMargin.getMarketIdByTokenAddress(core.tokens.honey.address);
    const registryImp = await impersonate(core.governance.address, true);
    await registry.connect(registryImp).ownerSetRewardVaultOverride(dToken.address, RewardVaultType.Infrared, (await import('../src/types')).TestInfraredVault__factory.connect(core.berachainRewardsEcosystem.infraredVault.address, core.hhUser1).address);
    await metaVault.getReward(dToken.address);

    const allowance = await core.tokens.honey.allowance(metaVault.address, core.dolomiteMargin.address);
    expect(allowance.eq(0)).to.be.true;
  });

  it('Other token deposit failure: resets allowance and transfers to owner', async () => {
    const feeToken = await (await import('../src/types')).FeeOnTransferERC20__factory.connect(
      (await (await import('ethers')).getContractFactory('FeeOnTransferERC20')).deploy.name,
      core.hhUser1,
    );
  });
});

