const { DSTOR_API_URL, AWS_KEY, AWS_SECRET } = process.env
const AWS = require('aws-sdk')
const fs = require('fs')

const s3 = new AWS.S3({
	accessKeyId: AWS_KEY,
	secretAccessKey: AWS_SECRET,
})

const replaceM3u8Links = (input, hashes) => {
	let newString = input
	for (let i = 0; i < Object.keys(hashes).length; i++) {
		newString = newString.replace(
			`stream${i}.ts\n`,
			`${DSTOR_API_URL}/ipfs/${hashes[i]}\n`
		)
	}
	return newString
}

const getCreateJobJSON = ({ time, userId, source, rand }) => {
	const timeAndRand = `${time}-${rand}`
	return {
		Inputs: [
			{
				Key: `a/${userId}/${source}`,
				FrameRate: 'auto',
				Resolution: 'auto',
				AspectRatio: 'auto',
				Interlaced: 'auto',
				Container: 'auto',
			},
		],
		OutputKeyPrefix: `a/${userId}/${timeAndRand}`, // folders
		Outputs: [
			{
				Key: `/400k/${timeAndRand}`, // folder and specific playlist m3u8 name
				ThumbnailPattern: `/${timeAndRand}/thumb_{count}`,
				Rotate: 'auto',
				PresetId: '1607203222250-n0nyn6',
				SegmentDuration: '10',
			},
		],
		Playlists: [
			{
				Format: 'HLSv3',
				Name: `/${timeAndRand}-master`, // folder and master _____.m3u8?
				OutputKeys: [`/400k/${timeAndRand}`], // folder and prefix before ________.ts
			},
		],
		UserMetadata: {
			rand,
			time: time.toString(),
		},
		PipelineId: '1605831556406-woiqni',
	}
}

// get list of objects in a specific folder in an S3 bucket
const getObjectsList = async ({ Bucket, Prefix }) => {
	return new Promise((resolve, reject) => {
		s3.listObjects(
			{
				Bucket,
				Prefix,
			},
			(err, data) => {
				if (err) reject(err)
				resolve(data)
			}
		)
	})
}

const getS3ObjectPromise = (params) => {
	return new Promise((resolve, reject) => {
		s3.getObject(params, (err, data) => {
			if (err) reject(err)
			resolve(data)
		})
	})
}

const getS3ObjectAttempt = async (Key, objectIndex, resultIndex) => {
	const params = {
		Bucket: process.env.S3_PROCESSED_BUCKET,
		Key,
	}
	return new Promise((resolve, reject) => {
		const getS3Object = async (iterator = 0) => {
			try {
				const result = await getS3ObjectPromise(params)
				resolve({
					result,
					resultIndex,
					objectIndex,
					Key,
				})
			} catch (err) {
				console.log('getObject error: ', err)
				if (iterator < 10) {
					setTimeout(() => getS3Object(iterator), 1000)
					iterator++
				} else {
					reject(false)
				}
			}
		}
		getS3Object()
	})
}

const multiTryS3Download = async (
	objectsToGet,
	writePrefix,
	progressObject
) => {
	let promisesToGet = []
	const finalResults = {}
	let writeIterator = 0
	const indicesToGet = objectsToGet.length - 1
	const maxIteration = indicesToGet < 4 ? indicesToGet : 4
	for (let objectIndex = 0; objectIndex < maxIteration; objectIndex++) {
		const fileKey = objectsToGet[objectIndex].file.Key
		promisesToGet.push(getS3ObjectAttempt(fileKey, objectIndex, objectIndex))
	}
	let masterIterator = maxIteration
	let finished = 0
	while (promisesToGet.length > 0 && writeIterator < objectsToGet.length + 1) {
		console.log('masterIterator: ', masterIterator)
		console.log('writeIterator: ', writeIterator)
		try {
			// await for next resolve
			const value = await Promise.race(promisesToGet)
			const { result, resultIndex, Key, objectIndex } = value
			finalResults[objectIndex] = result.Etag
			fs.writeFile(`${writePrefix}/${Key}`, result.Body, (err) => {
				if (err) {
					console.log(`writeFile error for file ${Key}: `, err)
				} else {
					progressObject.files[Key] = 'DOWNLOADED'
					writeIterator++
				}
			})
			finished++
			if (finished === objectsToGet.length - 1) {
				console.log('FINISHED!')
				console.log('finalResults: ', finalResults)
				return
			}
			if (masterIterator < objectsToGet.length - 1) {
				promisesToGet[resultIndex] = getS3ObjectAttempt(
					objectsToGet[masterIterator].file.Key,
					masterIterator,
					resultIndex
				)
				masterIterator++
			} else {
				promisesToGet[resultIndex] = getS3ObjectAttempt(
					objectsToGet[masterIterator].file.Key,
					masterIterator,
					resultIndex
				)
				const finalValues = await Promise.all(promisesToGet)
				promisesToGet = []
				finalValues.forEach((value) => {
					const { result, resultIndex, Key, objectIndex } = value
					console.log('result is: ', result, 'result index is: ', resultIndex)
					finalResults[objectIndex] = result.Etag
					fs.writeFile(`${writePrefix}/${Key}`, result.Body, async (err) => {
						if (err) {
							console.log('writeFile error: ', err)
						} else {
							console.log('last files being written')
							progressObject.files[Key] = 'DOWNLOADED'
							if (writeIterator === objectsToGet.length - 1) {
								console.log('last file save clause being executed')
								let fileDownloadProgress = 'DOWNLOAD_COMPLETE'
								Object.values(progressObject.files).forEach((status) => {
									if (status !== 'DOWNLOADED') {
										fileDownloadProgress = 'PARTIAL_DOWNLOAD'
									}
								})
								progressObject.progress = fileDownloadProgress
								return progressObject
							}
							writeIterator++
						}
					})
					finished++
				})
			}
		} catch (err) {
			console.log(err)
		}
	}

	/////////////////////////
	// now upload to dStor //
	/////////////////////////
}

module.exports = {
	replaceM3u8Links,
	getCreateJobJSON,
	getObjectsList,
	getS3ObjectPromise,
	getS3ObjectAttempt,
	multiTryS3Download,
}
