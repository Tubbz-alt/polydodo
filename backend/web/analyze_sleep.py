import json
import falcon

from backend.request import ClassificationRequest
from backend.response import ClassificationResponse
from backend.spectrogram_generator import SpectrogramGenerator
from classification.parser import get_raw_array
from classification.exceptions import ClassificationError
from classification.config.constants import Sex, ALLOWED_FILE_EXTENSIONS
from classification.model import SleepStagesClassifier
from classification.features.preprocessing import preprocess

sleep_stage_classifier = SleepStagesClassifier()


class AnalyzeSleep:
    @staticmethod
    def _validate_file(file_content):
        if file_content is None:
            raise ClassificationError("Missing file")

    @staticmethod
    def _validate_filename(filename):
        if not filename.lower().endswith(ALLOWED_FILE_EXTENSIONS):
            raise ClassificationError('File format not allowed')

    @staticmethod
    def _parse_form(form):
        form_data = {}
        file_content = None

        for part in form:
            if part.name == 'file':
                AnalyzeSleep._validate_filename(part.filename)
                file_content = part.stream.read().decode('utf-8')
            else:
                form_data[part.name] = part.text

        AnalyzeSleep._validate_file(file_content)

        return form_data, file_content

    def on_post(self, request, response):
        """
        Request payload example
        {
            "file": File(...),
            "device": "CYTON",
            "sex": "F",
            "age": "23",
            "stream_start": 1602895800000,
            "bedtime": 1602898320000,
            "wakeup": 1602931800000
        }
        """

        try:
            form_data, file = self._parse_form(request.get_media())
            raw_array = get_raw_array(file)
            classification_request = ClassificationRequest(
                age=int(form_data['age']),
                sex=Sex[form_data['sex']],
                stream_start=int(form_data['stream_start']),
                bedtime=int(form_data['bedtime']),
                wakeup=int(form_data['wakeup']),
                raw_eeg=raw_array,
            )
        except (KeyError, ValueError, ClassificationError):
            response.status = falcon.HTTP_400
            response.content_type = falcon.MEDIA_TEXT
            response.body = 'Missing or invalid request parameters'
            return

        preprocessed_epochs = preprocess(classification_request)
        predictions = sleep_stage_classifier.predict(preprocessed_epochs, classification_request)
        spectrogram_generator = SpectrogramGenerator(preprocessed_epochs)
        classification_response = ClassificationResponse(
            classification_request, predictions, spectrogram_generator.generate()
        )

        response.body = json.dumps(classification_response.response)