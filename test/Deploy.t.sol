// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployHelpersTest is Test {
    Deploy internal d = new Deploy();

    function test_formatDate() public view {
        assertEq(d.formatDate(1_790_553_600), "28SEP26"); // Monday 28 Sep 2026 00:00 UTC
        assertEq(d.formatDate(1_798_761_599), "31DEC26");
        assertEq(d.formatDate(1_709_164_800), "29FEB24"); // leap day
        assertEq(d.formatDate(0), "01JAN70");
    }

    function test_nextThursdayClose() public view {
        uint256 monday = 1_790_553_600; // Mon 28 Sep 2026
        uint256 thursday2000 = monday + 3 days + 20 hours;
        assertEq(d.nextThursdayClose(monday), thursday2000);
        assertEq(d.nextThursdayClose(thursday2000), thursday2000);
        assertEq(d.nextThursdayClose(thursday2000 + 1), thursday2000 + 1 weeks);
        assertEq(d.formatDate(d.nextThursdayClose(monday + 28 days)), "29OCT26");
    }
}
