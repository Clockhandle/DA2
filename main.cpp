#include<iostream>
#include<fstream>
#include<string>

int main(int argc, char* argv[]) {
    if(argc != 2)
    {
        std::cerr << "Usage: " << argv[0] << " <vertices.json> <indices.json>" << std::endl;
        return 1;
    }

    std::string filename = argv[1];
    std::ifstream file(filename);
    
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file " << filename << std::endl;
        return 1;
    }

    // Simple way to count vertices by counting "{" occurrences
    std::string line;
    int vertexCount = 0;
    
    while (std::getline(file, line)) {
        for (char c : line) {
            if (c == '{') {
                vertexCount++;
            }
        }
    }

    std::cout << "Number of vertices processed: " << vertexCount << std::endl;
    std::cout << "Processing completed successfully!" << std::endl;

    file.close();
    return 0;
}