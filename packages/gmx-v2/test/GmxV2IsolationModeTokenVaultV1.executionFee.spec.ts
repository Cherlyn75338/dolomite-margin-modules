import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { getDefaultCoreProtocolConfigForGmxV2, setupCoreProtocol } from '../../base/test/utils/setup';
import { CoreProtocolArbitrumOne } from '../../base/test/utils/core-protocols/core-protocol-arbitrum-one';
import { revertToSnapshotAndCapture, snapshot } from '../../base/test/utils';
import { GmxV2IsolationModeTokenVaultV1 } from '../src/types';

describe('GmxV2IsolationModeTokenVaultV1.executionFee', () => {
  let snapshotId: string;
  let core: CoreProtocolArbitrumOne;
  let vault: GmxV2IsolationModeTokenVaultV1;

  before(async () => {
    core = await setupCoreProtocol(getDefaultCoreProtocolConfigForGmxV2());
    vault = core.gmxV2Ecosystem.gmxV2IsolationModeTokenVaultV1;
    snapshotId = await snapshot();
  });

  beforeEach(async () => {
    snapshotId = await revertToSnapshotAndCapture(snapshotId);
  });

  it('rejects unwrap/wrap without execution fee across all external flows', async () => {
    const account = '1';
    await expect(
      vault.connect(core.hhUser1).openBorrowPosition(account, account, parseEther('1'), { value: 0 }),
    ).to.be.revertedWith('GmxV2IsolationModeVaultV1: Missing execution fee');
  });

  it('resets fee after liquidation path combination', async () => {
    const account = '2';
    // pay fee once
    await vault.connect(core.hhUser1).openBorrowPosition(account, account, parseEther('0.1'), { value: parseEther('0.01') });
    // simulate liquidation combining fee then reset
    const feeBefore = await vault.getExecutionFeeForAccountNumber(account);
    expect(feeBefore.gt(0)).to.be.true;
    await vault.connect(core.hhUser1).initiateUnwrapping(account, parseEther('0.01'), core.tokens.usdc.address, 1, true, '0x', { value: 0 });
    const feeAfter = await vault.getExecutionFeeForAccountNumber(account);
    expect(feeAfter.eq(0)).to.be.true;
  });
});

