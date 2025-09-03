// SPDX-License-Identifier: GPL-3.0-or-later
/*

    Copyright 2025 Dolomite

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

pragma solidity ^0.8.9;

import { IDolomitePriceOracle } from "@dolomite-exchange/modules-base/contracts/protocol/interfaces/IDolomitePriceOracle.sol";


/**
 * @title   MockOracleAggregatorHarness
 * @author  Dolomite
 *
 * @notice  Harness to simulate closing/borrowable states for testing POLPriceOracleV2 behavior through a mock Dolomite
 */
interface IMockDolomite {
    function setMarketClosing(address token, bool isClosing) external;
    function getMarketIsClosing(uint256 marketId) external view returns (bool);
    function getMarketIdByTokenAddress(address token) external view returns (uint256);
}

contract MockOracleAggregatorHarness {
    IDolomitePriceOracle public oracle;
    IMockDolomite public dolomite;

    constructor(address _oracle, address _dolomite) {
        oracle = IDolomitePriceOracle(_oracle);
        dolomite = IMockDolomite(_dolomite);
    }

    function getPrice(address token) external view returns (uint256) {
        return oracle.getPrice(token).value;
    }
}

