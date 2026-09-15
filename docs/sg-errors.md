# Error Codes

The Storm Glass API uses the following response error codes:

Error Code | Meaning
---------- | -------
402 | Payment Required -- You've exceeded the daily request limit for your subscription. Please consider upgrading if this happens frequently.
403 | Forbidden -- Your API-key was not provided together with the request or was provided but malformed. Please make sure that you specify your API-key correctly.
404 | Not Found -- You've requested an API resource that does not exist. Please review the API documentation.
405 | Method Not Allowed -- You've requested an API resource using a method that is unsupported. Please review the API documentation.
410 | Gone -- You've requested a legacy API resource that is no longer in service. Please review the API documentation.
422 | Unprocessable Content -- You've requested an API resource using parameters that the server doesn't understand how to process. Please review the API documentation.
503 | Service Unavailable -- We've encountered an unexpected problem with our systems. Please try again later.
