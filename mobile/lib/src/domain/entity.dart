import 'package:equatable/equatable.dart';
import 'package:polydodo/src/domain/unique_id.dart';

abstract class Entity extends Equatable {
  final UniqueId id;

  Entity(this.id);

  @override
  List<Object> get props => [id];
}