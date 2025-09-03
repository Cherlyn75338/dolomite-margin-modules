import { Network, ONE_ETH_BI, ZERO_BI } from '@dolomite-exchange/modules-base/src/utils/no-deps-constants';
import { getBlockTimestamp, revertToSnapshotAndCapture, snapshot } from '@dolomite-exchange/modules-base/test/utils';
import { expectThrow } from '@dolomite-exchange/modules-base/test/utils/assertions';
import { getDefaultCoreProtocolConfig, setupCoreProtocol, setupWETHBalance } from '@dolomite-exchange/modules-base/test/utils/setup';
import { setNextBlockTimestamp } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import {
  EmitterMultipleRewardTokens,
  EmitterMultipleRewardTokens__factory,
  MintableStorageVault,
  MintableStorageVault__factory,
  TestMintableERC20FalseReturn,
  TestMintableERC20FalseReturn__factory,
  TestMintableERC20NoReturn,
  TestMintableERC20NoReturn__factory,
  TestMintableFeeOnTransferERC20,
  TestMintableFeeOnTransferERC20__factory,
} from '../src/types';

const defaultAccountNumber = ZERO_BI;
const defaultAllocPoint = BigNumber.from('100');
const wethAmount = BigNumber.from('1003933040428380918');

xdescribe('EmitterMultipleRewardTokens - NonStandard Tokens', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let emitter: EmitterMultipleRewardTokens;
  let startTime: number;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfig(Network.ArbitrumOne));
    startTime = (await getBlockTimestamp(await ethers.provider.getBlockNumber())) + 200;
    emitter = await (await ethers.getContractFactory('EmitterMultipleRewardTokens'))
      .connect(core.hhUser1)
      .deploy(core.dolomiteMargin.address, core.dolomiteRegistry.address, ONE_ETH_BI, startTime) as EmitterMultipleRewardTokens;

    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(emitter.address, true);
    await setupWETHBalance(core, core.hhUser1, wethAmount, core.dolomiteMargin);
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  async function addRewardToken(tokenAddr: string) {
    const vault = await (await ethers.getContractFactory('MintableStorageVault'))
      .connect(core.hhUser1)
      .deploy(core.dolomiteMargin.address, tokenAddr) as MintableStorageVault;
    await core.dolomiteMargin.connect(core.governance).ownerSetGlobalOperator(vault.address, true);
    await emitter.connect(core.governance).ownerAddRewardToken(tokenAddr, vault.address, true);
    return vault;
  }

  it('should revert transfers for false-return token payout', async () => {
    const falseToken = await (await ethers.getContractFactory('TestMintableERC20FalseReturn'))
      .connect(core.hhUser1)
      .deploy('Bad', 'BAD') as TestMintableERC20FalseReturn;
    await addRewardToken(falseToken.address);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    await setNextBlockTimestamp(startTime + 1);

    await expectThrow(
      emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, ZERO_BI),
      'SafeERC20: ERC20 operation did not succeed',
    );
  });

  it('should handle no-return token transfer via SafeERC20', async () => {
    const noReturn = await (await ethers.getContractFactory('TestMintableERC20NoReturn'))
      .connect(core.hhUser1)
      .deploy('NoRet', 'NRET') as TestMintableERC20NoReturn;
    await addRewardToken(noReturn.address);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    await setNextBlockTimestamp(startTime + 1);

    // Should not revert, SafeERC20 treats lack of return as success
    await emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, ZERO_BI);
  });

  it('should account for fee-on-transfer tokens (user receives less, no revert)', async () => {
    const fee = await (await ethers.getContractFactory('TestMintableFeeOnTransferERC20'))
      .connect(core.hhUser1)
      .deploy('Fee', 'FEE', 100) as TestMintableFeeOnTransferERC20; // 1%
    await addRewardToken(fee.address);
    await emitter.connect(core.governance).ownerAddPool(core.marketIds.weth, defaultAllocPoint, false);
    await emitter.connect(core.hhUser1).deposit(defaultAccountNumber, core.marketIds.weth, wethAmount);
    await setNextBlockTimestamp(startTime + 100);

    await emitter.connect(core.hhUser1).withdraw(core.marketIds.weth, ZERO_BI);
  });
});

