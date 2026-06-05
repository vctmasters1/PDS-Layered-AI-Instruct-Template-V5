package vm.pds.h2o.dev_platforms.abstract

import vm.pds.h2o.automation.datamodels.DeviceAutomation
import vm.pds.h2o.dev_platforms.efr32mg24.hwrev_001.h2o_001.DefaultAutomation

object DefaultAutomationProvider {

    fun get(platformId: String): DeviceAutomation? {
        return when (platformId) {
            // EFR32MG24
            "EFR32MG24_H2O_001" -> DefaultAutomation.createDefaultAutomation()
            "EFR32MG24_WH_001" -> vm.pds.h2o.dev_platforms.efr32mg24.hwrev_001.wh_001.DefaultAutomation.createDefaultAutomation()

            // ESP32-C3 Super Mini
            "ESP32C3_SUPERMINI_H2O_001" -> vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.h2o_001.DefaultAutomation.createDefaultAutomation()
            "ESP32C3_SUPERMINI_WH_001" -> vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.wh_001.DefaultAutomation.createDefaultAutomation()

            // ESP32 Node32S
            "ESP32_NODE32S_H2O_001" -> vm.pds.h2o.dev_platforms.esp32_node32s.hwrev001.h2o001.DefaultAutomation.createDefaultAutomation()

            else -> null // Unknown platform
        }
    }
}