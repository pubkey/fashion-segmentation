FROM python:3.9.9

# install deps
COPY src/requirements.txt /requirements.txt
RUN pip3 install --no-cache-dir -r /requirements.txt

# show new requirements versions
RUN pip3 freeze > /requirements.txt
RUN cat /requirements.txt


# decompress the model files
COPY trained_model_compressed/trained_model.tar.bz2.partaa /trained_model_compressed/trained_model.tar.bz2.partaa
COPY trained_model_compressed/trained_model.tar.bz2.partab /trained_model_compressed/trained_model.tar.bz2.partab
COPY trained_model_compressed/trained_model.tar.bz2.partac /trained_model_compressed/trained_model.tar.bz2.partac
COPY trained_model_compressed/trained_model.tar.bz2.partad /trained_model_compressed/trained_model.tar.bz2.partad
COPY decompress-model.bash /decompress-model.bash
RUN cd / && bash /decompress-model.bash
RUN rm -rf /trained_model_compressed
RUN ls /trained_model

COPY src/server.py /server.py


ENTRYPOINT [ "python", "/server.py" ]
