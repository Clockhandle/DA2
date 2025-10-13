#include <iostream>
#include <fstream>
#include <string>
#include "tetgen.h"

//TODO: Cut smaller tetrahedra i.e generate more vertexes inside the cube, then generate more tetrahedra from said vertexes.


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
    b.parse_commandline(const_cast<char*>("pqa200")); // Example options: -p (PLC), -q (quality), -a (max volume)
    tetrahedralize(&b, &in, &out);
    
    std::cout << "Output mesh: " << out.numberofpoints << " vertices, " << out.numberoftetrahedra << " tetrahedra" << std::endl;

    std::string outputFile = "models/ply/cube_test/Cube_tetrahedra.ply";
    std::ofstream plyFile(outputFile);

    if (plyFile.is_open()) {
        int totalFaces = out.numberoftetrahedra * 4; // Each tetrahedron has 4 triangular faces
        
        plyFile << "ply\n";
        plyFile << "format ascii 1.0\n";
        plyFile << "element vertex " << out.numberofpoints << "\n";
        plyFile << "property float x\n";
        plyFile << "property float y\n";
        plyFile << "property float z\n";
        plyFile << "element face " << totalFaces << "\n";
        plyFile << "property list uchar int vertex_indices\n";
        plyFile << "end_header\n";
        
        // Write vertices
        for (int i = 0; i < out.numberofpoints; i++) {
            plyFile << out.pointlist[i*3] << " " 
                    << out.pointlist[i*3+1] << " " 
                    << out.pointlist[i*3+2] << "\n";
        }
        
        // Write faces for each tetrahedron
        for (int i = 0; i < out.numberoftetrahedra; i++) {
            int v1 = out.tetrahedronlist[i*4 + 0];
            int v2 = out.tetrahedronlist[i*4 + 1];
            int v3 = out.tetrahedronlist[i*4 + 2];
            int v4 = out.tetrahedronlist[i*4 + 3];
            
            // 4 triangular faces per tetrahedron
            plyFile << "3 " << v1 << " " << v2 << " " << v3 << "\n";
            plyFile << "3 " << v1 << " " << v2 << " " << v4 << "\n";
            plyFile << "3 " << v1 << " " << v3 << " " << v4 << "\n";
            plyFile << "3 " << v2 << " " << v3 << " " << v4 << "\n";
        }
        
        plyFile.close();
        std::cout << "Saved all tetrahedron faces to: " << outputFile << std::endl;
    } else {
        std::cerr << "Failed to create output file: " << outputFile << std::endl;
        return 1;
    }

    std::cout << "Tetgen processing complete!" << std::endl;
    
    return 0;
}