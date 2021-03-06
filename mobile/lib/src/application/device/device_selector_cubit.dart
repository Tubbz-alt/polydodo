import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:polydodo/src/domain/acquisition_device/acquisition_device.dart';
import 'package:polydodo/src/domain/acquisition_device/acquisition_device_locator_service.dart';
import 'device_selector_state.dart';

class DeviceSelectorCubit extends Cubit<DeviceState> {
  final AcquisitionDeviceLocatorService _deviceLocatorService;
  final List<AcquisitionDevice> _scannedDevices = [];

  Stream _deviceLocatorStream;
  StreamSubscription<AcquisitionDevice> _deviceLocatorStreamSubscription;

  DeviceSelectorCubit(this._deviceLocatorService) : super(DeviceInitial()) {
    startSearching();
  }

  void startSearching() {
    _scannedDevices.clear();
    _deviceLocatorStream = _deviceLocatorService.scan();

    if (_deviceLocatorStreamSubscription == null) {
      _deviceLocatorStreamSubscription = _deviceLocatorStream.listen((device) {
        _addDevice(device);
      });
    } else {
      _deviceLocatorStreamSubscription.resume();
    }
  }

  Future<void> connect(AcquisitionDevice device) async {
    emit(DeviceConnectionInProgress());

    _deviceLocatorStreamSubscription.pause();
    _deviceLocatorService.connect(device, connectionCallback);
  }

  void connectionCallback(bool connected, [Exception e]) {
    if (e != null) {
      emit(DeviceConnectionFailure(e));
      resetSearch();
    } else if (connected) {
      emit(DeviceConnectionSuccess());
    }
  }

  void resetSearch() {
    _deviceLocatorService.disconnect();
    startSearching();
  }

  void _addDevice(AcquisitionDevice device) {
    if (!_scannedDevices.contains(device)) {
      _scannedDevices.add(device);

      emit(DeviceSearchInProgress(_scannedDevices));
    }
  }
}
