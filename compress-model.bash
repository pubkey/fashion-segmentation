# compress the model in a way to make it commitable to github without reaching the 100mb file size limit

tar -cvjf trained_model_full.tar.bz2 ./trained_model/*
ls -lh trained_model_full.tar.bz2

rm -rf ./trained_model_compressed/
mkdir ./trained_model_compressed/
split -b 50M trained_model_full.tar.bz2 "./trained_model_compressed/trained_model.tar.bz2.part"
rm trained_model_full.tar.bz2
