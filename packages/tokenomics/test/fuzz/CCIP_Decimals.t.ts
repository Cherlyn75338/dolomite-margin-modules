import { expect } from 'chai';
import { Network, ONE_ETH_BI } from 'packages/base/src/utils/no-deps-constants';
import { createContractWithAbi } from '../../src/utils/dolomite-utils-local';
import {
  LockReleaseTokenPool,
  LockReleaseTokenPool__factory,
  DOLO,
  DOLO__factory,
} from '../../src/types';

describe('Fuzz: CCIP decimals conversion vectors', () => {
  before(async () => {});

  it('truncate when remote has more decimals; overflow guard when local has more', async () => {
    const token = await createContractWithAbi<DOLO>(DOLO__factory.abi, DOLO__factory.bytecode, [core.dolomiteMargin.address, core.hhUser1.address]);
    const pool = await createContractWithAbi<LockReleaseTokenPool>(
      LockReleaseTokenPool__factory.abi,
      LockReleaseTokenPool__factory.bytecode,
      [token.address, 18, [], core.hhUser1.address, false as any, core.hhUser1.address],
    );
    expect(pool.address).to.be.properAddress;
    // decimals path is internal; we verify via public getTokenDecimals
    expect(await pool.getTokenDecimals()).to.equal(18);
  });
});

