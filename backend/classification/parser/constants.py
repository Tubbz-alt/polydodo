from classification.config.constants import EEG_CHANNELS

ADS1299_Vref = 4.5
ADS1299_gain = 24.
SCALE_uV_PER_COUNT = ADS1299_Vref / ((2**23) - 1) / ADS1299_gain * 1000000
uV_TO_V = 1 / 1e6
SCALE_V_PER_COUNT = SCALE_uV_PER_COUNT * uV_TO_V

FILE_COLUMN_OFFSET = 1

RETAINED_COLUMNS = tuple(range(FILE_COLUMN_OFFSET, len(EEG_CHANNELS) + 1))
