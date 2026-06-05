package vm.pds.h2o.ui

import androidx.compose.runtime.Composable
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.pinconf.PinConfPanel
import vm.pds.h2o.viewmodel.MainViewModel

@Composable
fun SysconfScreen(
    platformDef: PlatformPinCapabilities,
    pinMap: DevicePinMap,
    onPinMapChange: (DevicePinMap) -> Unit,
    mainViewModel: MainViewModel
) {
    PinConfPanel(
        platformDef = platformDef,
        pinConfigs = pinMap.pins,
        onPinConfigChanged = { updatedConfig ->
            onPinMapChange(pinMap.updatePin(updatedConfig))
        },
        onSaveConfigs = { mainViewModel.savePinMap(pinMap) }
    )
}
