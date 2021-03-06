from collections import Counter
import numpy as np

from classification.config.constants import SleepStage, EPOCH_DURATION


class Metrics():
    def __init__(self, sleep_stages, bedtime):
        self.sleep_stages = sleep_stages
        self.bedtime = bedtime
        self.has_slept = len(np.unique(self.sleep_stages)) != 1 or np.unique(self.sleep_stages)[0] != SleepStage.W.name

        self.is_sleeping_stages = self.sleep_stages != SleepStage.W.name
        self.sleep_indexes = np.where(self.is_sleeping_stages)[0]
        self.is_last_stage_sleep = self.sleep_stages[-1] != SleepStage.W.name

        self._initialize_sleep_offset()
        self._initialize_sleep_latency()
        self._initialize_rem_latency()
        self._initialize_transition_based_metrics()

    @property
    def report(self):
        report = {
            'sleepOffset': self._sleep_offset,
            'sleepLatency': self._sleep_latency,
            'remLatency': self._rem_latency,
            'awakenings': self._awakenings,
            'stageShifts': self._stage_shifts,
            'sleepTime': self._sleep_time,
            'WASO': self._wake_after_sleep_onset,
            'sleepEfficiency': self._sleep_efficiency,
            'efficientSleepTime': self._efficient_sleep_time,
            'wakeAfterSleepOffset': self._wake_after_sleep_offset,
            'sleepOnset': self._sleep_onset,
            'remOnset': self._rem_onset,
            **self._time_passed_in_stage,
        }

        for metric in report:
            #  json does not recognize NumPy data types
            if isinstance(report[metric], np.int64):
                report[metric] = int(report[metric])

        return report

    @property
    def _sleep_time(self):
        if not self.has_slept:
            return 0

        return self._sleep_offset - self._sleep_onset

    @property
    def _wake_after_sleep_onset(self):
        if not self.has_slept:
            return 0

        return self._sleep_time - self._efficient_sleep_time

    @property
    def _time_passed_in_stage(self):
        """Calculates time passed in each stage for all of the sequence"""
        nb_epoch_passed_by_stage = Counter(self.sleep_stages)

        def get_time_passed(stage):
            return EPOCH_DURATION * nb_epoch_passed_by_stage[stage] if stage in nb_epoch_passed_by_stage else 0

        return {
            f"{stage.upper()}Time": get_time_passed(stage)
            for stage in SleepStage.tolist()
        }

    @property
    def _sleep_efficiency(self):
        return len(self.sleep_indexes) / len(self.sleep_stages)

    @property
    def _efficient_sleep_time(self):
        return len(self.sleep_indexes) * EPOCH_DURATION

    @property
    def _wake_after_sleep_offset(self):
        if not self.has_slept:
            return 0

        wake_after_sleep_offset_nb_epochs = (
            len(self.sleep_stages) - self.sleep_indexes[-1] - 1
        ) if not self.is_last_stage_sleep else 0

        return wake_after_sleep_offset_nb_epochs * EPOCH_DURATION

    @property
    def _sleep_onset(self):
        if not self.has_slept:
            return None

        return self._sleep_latency + self.bedtime

    @property
    def _rem_onset(self):
        rem_latency = self._rem_latency
        if rem_latency is None:
            return None

        return rem_latency + self.bedtime

    def _initialize_sleep_offset(self):
        if self.has_slept:
            sleep_nb_epochs = (self.sleep_indexes[-1] + 1) if len(self.sleep_indexes) else len(self.sleep_stages)
            sleep_offset = sleep_nb_epochs * EPOCH_DURATION + self.bedtime
        else:
            sleep_offset = None

        self._sleep_offset = sleep_offset

    def _initialize_sleep_latency(self):
        self._sleep_latency = self._get_latency_of_stage(self.is_sleeping_stages)

    def _initialize_rem_latency(self):
        """Time from the sleep onset to the first epoch of REM sleep"""
        if self.has_slept:
            bedtime_to_rem_duration = self._get_latency_of_stage(self.sleep_stages == SleepStage.REM.name)
            rem_latency = bedtime_to_rem_duration - self._sleep_latency if bedtime_to_rem_duration is not None else None
        else:
            rem_latency = None

        self._rem_latency = rem_latency

    def _initialize_transition_based_metrics(self):
        consecutive_stages_occurences = Counter(zip(self.sleep_stages[:-1], self.sleep_stages[1:]))
        occurences_by_transition = {
            consecutive_stages: consecutive_stages_occurences[consecutive_stages]
            for consecutive_stages in consecutive_stages_occurences if consecutive_stages[0] != consecutive_stages[1]
        }
        transition_occurences = list(occurences_by_transition.values())
        awakenings_occurences = [
            occurences_by_transition[transition_stages]
            for transition_stages in occurences_by_transition
            if transition_stages[0] != SleepStage.W.name
            and transition_stages[1] == SleepStage.W.name
        ]
        nb_stage_shifts = sum(transition_occurences)
        nb_awakenings = sum(awakenings_occurences)

        if self.is_last_stage_sleep and self.has_slept:
            nb_stage_shifts += 1
            nb_awakenings += 1

        self._stage_shifts = nb_stage_shifts
        self._awakenings = nb_awakenings

    def _get_latency_of_stage(self, sequence_is_stage):
        epochs_of_stage_of_interest = np.where(sequence_is_stage)[0]

        if len(epochs_of_stage_of_interest) == 0:
            return None

        return epochs_of_stage_of_interest[0] * EPOCH_DURATION
