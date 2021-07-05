rm -rf ./trained_model/
mkdir ./trained_model/
echo "# join compressed parts"
cat ./trained_model_compressed/trained_model.tar.bz2.parta* > trained_model_full.tar.gz
echo "# extract model"
tar -xf trained_model_full.tar.gz
echo "# cleanup"
rm trained_model_full.tar.gz
