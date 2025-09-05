import { ethers } from 'hardhat';
import { Contract } from 'ethers';
import {
  LocalTestToken__factory,
  VoterAlwaysActive__factory,
  VeFeeCalculator,
  VeFeeCalculator__factory,
  VotingEscrow,
  VotingEscrow__factory,
} from '../types';

export async function createContractWithAbi<T extends Contract>(abi: any, bytecode: string, args: any[]): Promise<T> {
  const [deployer] = await ethers.getSigners();
  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  const contract = (await factory.deploy(...args)) as T;
  await contract.deployed();
  return contract;
}

export async function createTestToken() {
  const [deployer] = await ethers.getSigners();
  const token = await new LocalTestToken__factory(deployer).deploy();
  await token.deployed();
  return token;
}

export async function createVeFeeCalculator(): Promise<VeFeeCalculator> {
  const [deployer] = await ethers.getSigners();
  // pass deployer as dolomiteMargin owner placeholder
  const calc = await new VeFeeCalculator__factory(deployer).deploy(deployer.address);
  await calc.deployed();
  return calc;
}

export async function createVotingEscrow(
  token: Contract,
  voter: string,
  feeCalc: VeFeeCalculator,
  vester: string,
  buyback: string,
): Promise<VotingEscrow> {
  const [deployer] = await ethers.getSigners();
  const ve = await new VotingEscrow__factory(deployer).deploy();
  await ve.deployed();
  await ve.initialize(token.address, (await new VoterAlwaysActive__factory(deployer).deploy()).address, voter, feeCalc.address, vester, buyback, deployer.address);
  return ve;
}

