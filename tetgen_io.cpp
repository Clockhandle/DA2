#include "tetgen.h"
#include <iostream>

int main(int argc, char* argv[]) {
    if(argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <input.ply>" << std::endl;
        return 1;
    }

    std::string inputFile = argv[1];
    std::cout << "Processing file: " << inputFile << std::endl;

    //TODO: Load PLY file and convert to tetgen input format
    std::cout <<"Tetgen processing of " << inputFile << " complete!" << std::endl;
    return 0;
}