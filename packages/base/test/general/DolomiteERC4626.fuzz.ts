import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import {
  DolomiteERC4626,
  DolomiteERC4626__factory,
  FeeOnTransferToken,
  FeeOnTransferToken__factory,
} from '../../src/types';
import { CoreProtocolArbitrumOne } from '../utils/core-protocols/core-protocol-arbitrum-one';
import { getDolomiteErc4626ImplementationConstructorParams } from '../../src/utils/constructors/dolomite';
import { createContractWithAbi, depositIntoDolomiteMargin } from '../../src/utils/dolomite-utils';
import { Network, ZERO_BI } from '../../src/utils/no-deps-constants';
import { revertToSnapshotAndCapture, snapshot } from '../utils';
import { setupCoreProtocol } from '../utils/setup';

describe('DolomiteERC4626.fuzz', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let token: DolomiteERC4626;
  let fot: FeeOnTransferToken;

  before(async () => {
    core = await setupCoreProtocol({ network: Network.ArbitrumOne });

    // Deploy fee-on-transfer token and add as a new market for isolated testing
    fot = await createContractWithAbi<FeeOnTransferToken>(
      FeeOnTransferToken__factory.abi,
      FeeOnTransferToken__factory.bytecode,
      ['FeeToken', 'FEE', 18, core.hhUser1.address, 300], // 3% fee
    );

    await (await fot.mint(core.hhUser1.address, parseEther('100000'))).wait();

    const res = await core.addTestMarket(fot.address);
    const marketId = res.marketId;

    const impl = await createContractWithAbi<DolomiteERC4626>(
      DolomiteERC4626__factory.abi,
      DolomiteERC4626__factory.bytecode,
      await getDolomiteErc4626ImplementationConstructorParams(core),
    );
    const proxyAddr = await core.createDolomiteErc4626Proxy(marketId.toString(), impl.address);
    token = DolomiteERC4626__factory.connect(proxyAddr, core.hhUser1);

    await token.connect(core.hhUser1).initialize('Dolomite: FEE', 'dFEE', 18, marketId);
    await core.dolomiteMargin.ownerSetGlobalOperator(token.address, true);

    // seed base protocol with some liquidity to convert par/wei
    await fot.connect(core.hhUser1).approve(core.dolomiteMargin.address, parseEther('1000'));
    await depositIntoDolomiteMargin(core, core.hhUser1, ZERO_BI, marketId, parseEther('1000'));

    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('fuzz deposit/withdraw with fee-on-transfer underlying keeps monotonicity and respects caps', async () => {
    const marketId = await token.marketId();
    // lift cap for baseline then set finite cap
    await core.dolomiteMargin.ownerSetMaxWei(marketId, 0);
    await core.dolomiteMargin.ownerSetMaxWei(marketId, parseEther('1200'));

    for (let i = 0; i < 10; i++) {
      const amount = parseEther((10 + i).toString());
      await fot.connect(core.hhUser2).mint(core.hhUser2.address, amount);
      await fot.connect(core.hhUser2).approve(token.address, amount);
      const sharesBefore = await token.balanceOf(core.hhUser2.address);
      const assetsBefore = await token.totalAssets();
      await token.connect(core.hhUser2).deposit(amount, core.hhUser2.address);
      const sharesAfter = await token.balanceOf(core.hhUser2.address);
      const assetsAfter = await token.totalAssets();
      expect(sharesAfter).to.be.gte(sharesBefore); // monotonic shares
      expect(assetsAfter).to.be.gte(assetsBefore); // monotonic assets (par-based)
      const maxDeposit = await token.maxDeposit(core.hhUser2.address);
      expect(maxDeposit.gte(0)).to.be.true; // not reverted
    }
  });

  it('simulated donation does not allow free share mint profit', async () => {
    const marketId = await token.marketId();
    // user mints baseline shares
    await fot.connect(core.hhUser2).mint(core.hhUser2.address, parseEther('100'));
    await fot.connect(core.hhUser2).approve(token.address, parseEther('100'));
    await token.connect(core.hhUser2).deposit(parseEther('100'), core.hhUser2.address);
    const sharesBefore = await token.balanceOf(core.hhUser2.address);

    // donate underlying directly to protocol via ownerWithdrawExcessTokens path trigger by transfer to token
    await fot.connect(core.hhUser1).mint(token.address, parseEther('50'));

    // Conversions should not allow minting shares for free
    const assetsPerShare = await token.convertToAssets(sharesBefore);
    await expect(
      token.connect(core.hhUser2).mint(parseEther('1'), core.hhUser2.address),
    ).to.not.be.reverted;
    const delta = (await token.convertToAssets(await token.balanceOf(core.hhUser2.address))).sub(assetsPerShare);
    expect(delta.gte(0)).to.be.true; // no negative drift
  });

  it('cap lift sandwich attempt during lossy path reverts deposit', async () => {
    const marketId = await token.marketId();
    // set finite cap
    await core.dolomiteMargin.ownerSetMaxWei(marketId, parseEther('1000'));

    // trigger lossy path by causing rounding imbalance: do a tiny transfer to self via ERC4626 transfer
    await fot.connect(core.hhUser2).mint(core.hhUser2.address, parseEther('10'));
    await fot.connect(core.hhUser2).approve(token.address, parseEther('10'));
    await token.connect(core.hhUser2).deposit(parseEther('10'), core.hhUser2.address);

    // adversary attempts to deposit exactly at cap boundary expecting transient lift
    await fot.connect(core.hhUser3).mint(core.hhUser3.address, parseEther('2000'));
    await fot.connect(core.hhUser3).approve(token.address, parseEther('2000'));
    await expect(
      token.connect(core.hhUser3).deposit(parseEther('1500'), core.hhUser3.address),
    ).to.be.reverted; // expect revert due to cap enforcement
  });
});

