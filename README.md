# Simple LLM Completion

This VSCode extension adds LLM completion for local LLM services using an OpenAI API-compatible endpoint.

## Features

- Uses an OpenAI API-compatible endpoint (`v1/completions`).
- Uses the [Qwen Coder FIM](https://github.com/QwenLM/Qwen3-Coder/blob/main/examples/Qwen2.5-Coder.md) template for prompts.
- Uses open files as an additional context (optional).
- Triggers automatically (optional).
- Sends at most 1 request at a time.

## Requirements

You will need an LLM service that serves the LLM model, compatible with the OpenAI API.  Examples include [llama.cpp](https://github.com/ggml-org/llama.cpp/releases), [LM Studio](https://lmstudio.ai/), [Lemonade](https://lemonade-server.ai/), and other LLM service implementations.

The extension has been tested with the following model families:
- Qwen2.5-Coder
- Qwen3.0-Coder

### How to Start a Local LLM Service?

You can start a local service with the Qwen2.5-Coder-3B model using a selection of implementations.

<details>
<summary>Using llama.cpp CLI</summary>

1.  Start the service:
    ```
    llama-server --fim-qwen-3b-default
    ```
2.  Set the `apiEndpoint` in the extension settings to `http://127.0.0.1:8012/v1`.

</details>

<details>
<summary>Using LM Studio CLI</summary>

> Note: LM Studio does not provide the Qwen2.5-Coder-3B model out-of-the-box.

1.  Prepare the model directory:
    ```
    mkdir -p ~/.lmstudio/models/qwen/qwen2.5-coder-3b
    ```
2.  Download the model from Hugging Face:
    ```
    curl -L https://huggingface.co/ggml-org/Qwen2.5-Coder-3B-Q8_0-GGUF/resolve/main/qwen2.5-coder-3b-q8_0.gguf -o ~/.lmstudio/models/qwen/qwen2.5-coder-3b/qwen2.5-coder-3b-q8_0.gguf
    ```
3.  Load the model and start the service:
    ```
    lms load qwen/qwen2.5-coder-3b --context-length 32768 && lms server start
    ```
4.  Set the `apiEndpoint` in the extension settings to `http://127.0.0.1:1234/v1`.
5.  Set the `model` in the extension settings to `qwen2.5-coder-3b`.

</details>

<details>
<summary>Using Lemonade CLI</summary>

> Note: Lemonade does not provide the Qwen2.5-Coder-3B model out-of-the-box.

1.  Download the model:
    ```
    lemonade-server pull user.qwen2.5-coder-3b --checkpoint ggml-org/Qwen2.5-Coder-3B-Q8_0-GGUF:Q8_0 --recipe llamacpp
    ```
2.  Start the service:
    ```
    lemonade-server serve --ctx-size 0
    ```
3.  Set the `apiEndpoint` in the extension settings to `http://127.0.0.1:8000/api/v1`.
4.  Set the `model` in the extension settings to `user.qwen2.5-coder-3b`.

</details>

### Others

Ollama does not work. Ollama appends the chat template to the `v1/completions` endpoint; see [the issue](https://github.com/ollama/ollama/issues/5544).


## Extension Settings

The extension contributes the following settings:
* `simple-llm-completion.useAutomaticCompletion`:  Enable automatic completion.
* `simple-llm-completion.useContextFromOpenFiles`: Enable using open files in the editor for context.
* `simple-llm-completion.apiEndpoint`: The endpoint compatible with the OpenAI API (default: `http://127.0.0.1:8012/v1`).
* `simple-llm-completion.model`: The name of the model to use (the service may ignore this property).
* `simple-llm-completion.temperature`: The temperature parameter for the model.
* `simple-llm-completion.maxCompletionTokens`: The maximum number of tokens to generate in a single completion.

The extension uses the environment variable `OPENAI_API_KEY` if it's set.

## Extension Hotkeys

This extension sets the following hotkeys:
* `Ctrl + L`:  Trigger the completion.

## Release Notes

### 0.0.1

Initial release of the extension.
