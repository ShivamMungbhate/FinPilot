from app.llm import test_gemini_connection

if __name__ == "__main__":
    print("Testing Gemini connection...")

    try:
        result = test_gemini_connection()
        print("Gemini response:", result)
        print("Connection test completed successfully.")

    except Exception as error:
        print("Gemini connection failed.")
        print("Error:", error)