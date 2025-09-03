import { DolomiteOwnerV2 } from '@dolomite-exchange/modules-admin/src/types';
import {
  DolomiteERC4626,
  DolomiteERC4626__factory,
  RegistryProxy__factory,
} from '@dolomite-exchange/modules-base/src/types';
import {
  Network,
  ONE_BI,
  ONE_DAY_SECONDS,
  ONE_ETH_BI,
  ZERO_BI,
} from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { impersonate, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import {
  expectProtocolBalance,
  expectThrow,
} from '@dolomite-exchange/modules-base/test/utils/assertions';
import {
  disableInterestAccrual,
  setupCoreProtocol,
  setupHONEYBalance,
  setupTestMarket,
  setupUserVaultProxy,
  setupWETHBalance,
} from '@dolomite-exchange/modules-base/test/utils/setup';
import { increase } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import {
  createContractWithAbi,
  createTestToken,
  depositIntoDolomiteMargin,
} from 'packages/base/src/utils/dolomite-utils';
import { SignerWithAddressWithSafety } from 'packages/base/src/utils/SignerWithAddressWithSafety';
import { CoreProtocolBerachain } from 'packages/base/test/utils/core-protocols/core-protocol-berachain';
import { createLiquidatorProxyV6, setupNewGenericTraderProxy } from 'packages/base/test/utils/dolomite';
import {
  BerachainRewardsRegistry,
  IInfraredVault,
  IInfraredVault__factory,
  InfraredBGTIsolationModeTokenVaultV1__factory,
  InfraredBGTIsolationModeVaultFactory,
  InfraredBGTMetaVault,
  InfraredBGTMetaVault__factory,
  POLIsolationModeTokenVaultV1,
  POLIsolationModeTokenVaultV1__factory,
  POLIsolationModeVaultFactory,
  POLIsolationModeWrapperTraderV2,
  TestInfraredVault,
  TestInfraredVault__factory,
} from '../src/types';
import {
  createBerachainRewardsRegistry,
  createInfraredBGTIsolationModeTokenVaultV1,
  createInfraredBGTIsolationModeVaultFactory,
  createPOLIsolationModeTokenVaultV1,
  createPOLIsolationModeVaultFactory,
  createPOLIsolationModeWrapperTraderV2,
  createPolLiquidatorProxy,
  RewardVaultType,
} from './berachain-ecosystem-utils';
import { ethers } from 'hardhat';

const defaultAccountNumber = ZERO_BI;
const amountWei = parseEther('.5');

describe('InfraredBGTMetaVault.Allowances', () => {
  let snapshotId: string;

  let core: CoreProtocolBerachain;
  let registry: BerachainRewardsRegistry;
  let factory: POLIsolationModeVaultFactory;
  let iBgtFactory: InfraredBGTIsolationModeVaultFactory;
  let vault: POLIsolationModeTokenVaultV1;
  let metaVault: InfraredBGTMetaVault;
  let wrapper: POLIsolationModeWrapperTraderV2;
  let testInfraredVault: TestInfraredVault;
  let dolomiteOwner: DolomiteOwnerV2;
  let dolomiteOwnerImpersonator: SignerWithAddressWithSafety;

  let dToken: DolomiteERC4626;
  let infraredVault: IInfraredVault;
  let parAmount: BigNumber;
  let marketId: BigNumber;
  let iBgtMarketId: BigNumber;

  before(async () => {
    core = await setupCoreProtocol({
      blockNumber: 2_040_000,
      network: Network.Berachain,
    });
    await disableInterestAccrual(core, core.marketIds.weth);

    dToken = core.dolomiteTokens.weth!.connect(core.hhUser1);
    const implementation = await createContractWithAbi<DolomiteERC4626>(
      DolomiteERC4626__factory.abi,
      DolomiteERC4626__factory.bytecode,
      [core.config.network, core.dolomiteRegistry.address, core.dolomiteMargin.address],
    );
    const dTokenProxy = RegistryProxy__factory.connect(dToken.address, core.governance);
    await dTokenProxy.upgradeTo(implementation.address);

    const liquidatorProxyV6 = await createLiquidatorProxyV6(core);
    const polLiquidatorProxy = await createPolLiquidatorProxy(core, liquidatorProxyV6);
    const metaVaultImplementation = await createContractWithAbi<InfraredBGTMetaVault>(
      InfraredBGTMetaVault__factory.abi,
      InfraredBGTMetaVault__factory.bytecode,
      [],
    );
    registry = await createBerachainRewardsRegistry(core, metaVaultImplementation, polLiquidatorProxy);

    infraredVault = IInfraredVault__factory.connect(
      await registry.rewardVault(dToken.address, RewardVaultType.Infrared),
      core.hhUser1,
    );

    const vaultImplementation = await createPOLIsolationModeTokenVaultV1();
    factory = await createPOLIsolationModeVaultFactory(core, registry, dToken, vaultImplementation, [], []);

    const iBgtVaultImplementation = await createInfraredBGTIsolationModeTokenVaultV1();
    iBgtFactory = await createInfraredBGTIsolationModeVaultFactory(
      registry,
      core.tokens.iBgt,
      iBgtVaultImplementation,
      core,
    );

    marketId = await core.dolomiteMargin.getNumMarkets();
    await core.testEcosystem!.testPriceOracle.setPrice(factory.address, parseEther('2000'));
    await setupTestMarket(core, factory, true);

    iBgtMarketId = await core.dolomiteMargin.getNumMarkets();
    await core.testEcosystem!.testPriceOracle.setPrice(iBgtFactory.address, ONE_ETH_BI);
    await setupTestMarket(core, iBgtFactory, true);

    wrapper = await createPOLIsolationModeWrapperTraderV2(core, registry, factory);

    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(factory.address, true);
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(iBgtFactory.address, true);
    await factory.connect(core.governance).ownerInitialize([wrapper.address]);
    await iBgtFactory.connect(core.governance).ownerInitialize([]);
    await registry.connect(core.governance).ownerSetIBgtIsolationModeVaultFactory(iBgtFactory.address);

    await factory.createVault(core.hhUser1.address);
    vault = setupUserVaultProxy<POLIsolationModeTokenVaultV1>(
      await factory.getVaultByAccount(core.hhUser1.address),
      POLIsolationModeTokenVaultV1__factory,
      core.hhUser1,
    );
    metaVault = InfraredBGTMetaVault__factory.connect(
      await registry.getMetaVaultByAccount(core.hhUser1.address),
      core.hhUser1,
    );

    await setupWETHBalance(core, core.hhUser1, amountWei, core.dolomiteMargin);
    await depositIntoDolomiteMargin(core, core.hhUser1, defaultAccountNumber, core.marketIds.weth, amountWei);
    await expectProtocolBalance(core, core.hhUser1, defaultAccountNumber, core.marketIds.weth, amountWei);
    parAmount = await dToken.balanceOf(core.hhUser1.address);

    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(wrapper.address, true);
    await setupNewGenericTraderProxy(core, marketId);

    testInfraredVault = await createContractWithAbi<TestInfraredVault>(
      TestInfraredVault__factory.abi,
      TestInfraredVault__factory.bytecode,
      [dToken.address],
    );

    // Create wrapped position
    await vault.addCollateralAndSwapExactInputForOutput(
      defaultAccountNumber,
      defaultAccountNumber,
      [core.marketIds.weth, marketId],
      parAmount,
      ONE_BI,
      [
        {
          trader: wrapper.address,
          traderType: 4,
          tradeData: ethers.utils.defaultAbiCoder.encode(['uint256'], [2]),
          makerAccountIndex: 0,
        },
      ],
      [
        {
          owner: metaVault.address,
          number: defaultAccountNumber,
        },
      ],
      {
        deadline: '9999999999999',
        balanceCheckFlag: 0,
        eventType: 0,
      },
    );

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('zeros approvals after iBGT reward deposit path', async () => {
    const infraredImpersonator = await impersonate(core.berachainRewardsEcosystem.infrared.address, true);
    await core.tokens.iBgt.connect(infraredImpersonator).approve(infraredVault.address, parseEther('100'));
    await infraredVault.connect(infraredImpersonator).notifyRewardAmount(core.tokens.iBgt.address, parseEther('100'));

    await increase(10 * ONE_DAY_SECONDS);
    await vault.getReward();

    const iBgtVaultAddress = await iBgtFactory.getVaultByAccount(core.hhUser1.address);
    expect(await core.tokens.iBgt.allowance(metaVault.address, iBgtVaultAddress)).to.eq(ZERO_BI);
    expect(await core.tokens.iBgt.allowance(metaVault.address, core.dolomiteMargin.address)).to.eq(ZERO_BI);
  });

  it('zeros approvals after non-iBGT deposit success path', async () => {
    const rewardAmount = parseEther('1');
    await testInfraredVault.setRewardTokens([core.tokens.honey.address]);
    await setupHONEYBalance(core, core.hhUser1, rewardAmount, { address: testInfraredVault.address });
    await testInfraredVault.connect(core.hhUser1).addReward(core.tokens.honey.address, rewardAmount);
    await registry
      .connect(core.governance)
      .ownerSetRewardVaultOverride(dToken.address, RewardVaultType.Infrared, testInfraredVault.address);

    await vault.getReward();
    expect(await core.tokens.honey.allowance(metaVault.address, core.dolomiteMargin.address)).to.eq(ZERO_BI);
  });

  it('does not revert for USDT-like token on first claim (zero-first required)', async () => {
    const usdtFactory = await ethers.getContractFactory('TestUSDTLike');
    const usdt = await usdtFactory.deploy();
    await usdt.deployed();

    const rewardAmount = BigNumber.from('1000000'); // 1 token with 6 decimals
    await usdt.mint(testInfraredVault.address, rewardAmount);
    await testInfraredVault.setRewardTokens([usdt.address]);
    await testInfraredVault.notifyRewardAmount(usdt.address, rewardAmount);
    await registry
      .connect(core.governance)
      .ownerSetRewardVaultOverride(dToken.address, RewardVaultType.Infrared, testInfraredVault.address);

    await vault.getReward();
  });

  xit('reclaiming USDT-like rewards twice should revert until zero-first mitigation is implemented', async () => {
    // This test documents the current limitation and should pass once zero-first approval mitigation is in place
    const usdtFactory = await ethers.getContractFactory('TestUSDTLike');
    const usdt = await usdtFactory.deploy();
    await usdt.deployed();

    const rewardAmount = BigNumber.from('1000000');
    await usdt.mint(testInfraredVault.address, rewardAmount.mul(2));
    await testInfraredVault.setRewardTokens([usdt.address]);
    await testInfraredVault.notifyRewardAmount(usdt.address, rewardAmount);
    await registry
      .connect(core.governance)
      .ownerSetRewardVaultOverride(dToken.address, RewardVaultType.Infrared, testInfraredVault.address);
    await vault.getReward();

    await testInfraredVault.notifyRewardAmount(usdt.address, rewardAmount);
    await expectThrow(vault.getReward(), 'USDT: approve from non-zero to non-zero');
  });
});

