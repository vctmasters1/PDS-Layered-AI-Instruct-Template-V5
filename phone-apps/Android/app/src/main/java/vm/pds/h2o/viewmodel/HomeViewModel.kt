package vm.pds.h2o.viewmodel

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import vm.pds.h2o.data.DeviceStatus

class HomeViewModel : ViewModel() {

    private val _deviceStatusList = MutableStateFlow<List<DeviceStatus>>(emptyList())
    val deviceStatusList: StateFlow<List<DeviceStatus>> = _deviceStatusList

}
