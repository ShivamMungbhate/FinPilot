from app.llm import get_gemini_client

if __name__ == "__main__":
    client = get_gemini_client()

    print("Checking models available to your API key...\n")

    for model in client.models.list():
        actions = getattr(model, "supported_actions", [])
        if "generateContent" in actions:
            print(model.name)