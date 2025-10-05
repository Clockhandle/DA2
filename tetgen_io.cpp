#include <iostream>
#include <fstream>
#include <string>
#include "tetgen.h"

int main(int argc, char* argv[]) {
    if(argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <input.ply>" << std::endl;
        return 1;
    }

    std::string inputFile = argv[1];
    std::cout << "Processing file: " << inputFile << std::endl;
    
    tetgenio in;
    tetgenio out;

    if (!in.load_ply(const_cast<char*>(inputFile.c_str()))) {
        std::cerr << "Error loading PLY file: " << inputFile << std::endl;
        return 1;
    }

    std::cout << "Input mesh: " << in.numberofpoints << " vertices, " << in.numberoffacets << " faces" << std::endl;

    tetgenbehavior b;
    b.parse_commandline(const_cast<char*>(""));
    tetrahedralize(&b, &in, &out);
    
    std::cout << "Output mesh: " << out.numberofpoints << " vertices, " << out.numberoftetrahedra << " tetrahedra" << std::endl;

    // Manual PLY export
    std::string outputFile = "models/ply/monke_test/Monke_cut.ply";
    std::ofstream plyFile(outputFile);

    if (plyFile.is_open()) {
        // Write PLY header
        plyFile << "ply\n";
        plyFile << "format ascii 1.0\n";
        plyFile << "element vertex " << out.numberofpoints << "\n";
        plyFile << "property float x\n";
        plyFile << "property float y\n";
        plyFile << "property float z\n";
        plyFile << "element face " << out.numberoftrifaces << "\n";
        plyFile << "property list uchar int vertex_indices\n";
        plyFile << "end_header\n";
        
        // Write vertices
        for (int i = 0; i < out.numberofpoints; i++) {
            plyFile << out.pointlist[i*3] << " " 
                    << out.pointlist[i*3+1] << " " 
                    << out.pointlist[i*3+2] << "\n";
        }
        
        // Write faces (boundary faces only)
        for (int i = 0; i < out.numberoftrifaces; i++) {
            plyFile << "3 " << out.trifacelist[i*3] << " " 
                    << out.trifacelist[i*3+1] << " " 
                    << out.trifacelist[i*3+2] << "\n";
        }
        
        plyFile.close();
        std::cout << "Saved tetrahedralized mesh to: " << outputFile << std::endl;
    } else {
        std::cerr << "Failed to create output file: " << outputFile << std::endl;
        return 1;
    }

    std::cout << "Tetgen processing complete!" << std::endl;
    
    return 0;
}