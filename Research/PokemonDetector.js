// API key goes in the Authorization header (inference v1.5.0+)
const response = await fetch('https://serverless.roboflow.com/james-roberts-y3m0h/workflows/pokemon-card-detection-and-count-1789707144389', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Z6TtvGrYAekESXvV1V2h'
    },
    body: JSON.stringify({
        inputs: {
            "image": {"type": "url", "value": "IMAGE_URL"}
        }
    })
});

const result = await response.json();
console.log(result);
