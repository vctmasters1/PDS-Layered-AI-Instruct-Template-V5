package vm.pds.h2o.dev_platforms.abstract

import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.dev_platforms.esp32c3_supermini.common.PinCapabilities as Esp32C3Caps
import vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.h2o_001.PinConfigDefaults as Esp32C3H2O
import vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.wh_001.DefaultPinMap as Esp32C3WH
import vm.pds.h2o.dev_platforms.esp32_node32s.common.PinCapabilities as Node32SCaps
import vm.pds.h2o.dev_platforms.esp32_node32s.hwrev001.h2o001.DefaultPinMap as Node32SH2O
import vm.pds.h2o.dev_platforms.efr32mg24.common.PinCapabilities as Efr32Caps
import vm.pds.h2o.dev_platforms.efr32mg24.hwrev_001.h2o_001.DefaultPinMap as Efr32H2O

object DefaultPinMapProvider {

    fun get(platformId: String): DevicePinMap {
        return when (platformId) {
            "ESP32C3_SUPERMINI_H2O_001" -> Esp32C3H2O.createDefaultPinMap()
            "ESP32C3_SUPERMINI_WH_001"  -> Esp32C3WH.create(Esp32C3Caps)
            "ESP32_NODE32S_H2O_001"     -> Node32SH2O.create(Node32SCaps)
            "EFR32MG24_H2O_001"         -> Efr32H2O.create(Efr32Caps)
            else                        -> Esp32C3H2O.createDefaultPinMap()
        }
    }
}
