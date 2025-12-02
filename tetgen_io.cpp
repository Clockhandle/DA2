#include <iostream>
#include <fstream>
#include <string>
#include <cstdlib>
#include <ctime>
#include <vector>
#include <sstream>
#include <iomanip>
#include "tetgen.h"

void writePLY(const std::string& filename, const std::vector<double>& vertices, const std::vector<std::vector<int>>& faces) {
    std::ofstream plyFile(filename);
    
    if (!plyFile.is_open()) {
        std::cerr << "Failed to write: " << filename << std::endl;
        return;
    }
    
    int totalVertices = vertices.size() / 3;
    int totalFaces = faces.size();
    
    plyFile << "ply\n";
    plyFile << "format ascii 1.0\n";
    plyFile << "element vertex " << totalVertices << "\n";
    plyFile << "property float x\n";
    plyFile << "property float y\n";
    plyFile << "property float z\n";
    plyFile << "element face " << totalFaces << "\n";
    plyFile << "property list uchar int vertex_indices\n";
    plyFile << "end_header\n";
    
    for(size_t i = 0; i < vertices.size(); i += 3) {
        plyFile << vertices[i] << " " << vertices[i+1] << " " << vertices[i+2] << "\n";
    }
    
    for(const auto& face : faces) {
        plyFile << face.size();
        for(int idx : face) {
            plyFile << " " << idx;
        }
        plyFile << "\n";
    }
    
    plyFile.close();
}

int main(int argc, char* argv[]) {
    if(argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <input.ply>" << std::endl;
        return 1;
    }

    std::srand(static_cast<unsigned int>(std::time(0)));

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
    b.parse_commandline(const_cast<char*>("pqa"));
    tetrahedralize(&b, &in, &out);
    
    std::cout << "Output mesh: " << out.numberofpoints << " vertices, " << out.numberoftetrahedra << " tetrahedra" << std::endl;

    int filesWritten = 0;
    
    for (int tetIdx = 0; tetIdx < out.numberoftetrahedra; tetIdx++) {
        // Get the 4 original corner indices
        int corners[4];
        corners[0] = out.tetrahedronlist[tetIdx*4 + 0];
        corners[1] = out.tetrahedronlist[tetIdx*4 + 1];
        corners[2] = out.tetrahedronlist[tetIdx*4 + 2];
        corners[3] = out.tetrahedronlist[tetIdx*4 + 3];
        
        // Get actual 3D coordinates of the 4 corners
        double v[4][3];
        for(int i = 0; i < 4; i++) {
            v[i][0] = out.pointlist[corners[i]*3 + 0];
            v[i][1] = out.pointlist[corners[i]*3 + 1];
            v[i][2] = out.pointlist[corners[i]*3 + 2];
        }
        
        // Define 6 edges (each edge connects 2 corners)
        int edges[6][2] = {
            {0, 1}, {0, 2}, {0, 3},
            {1, 2}, {1, 3}, {2, 3}
        };
        
        // Generate TWO cut points per edge
        // Point A: closer to first vertex (10%-30% along edge)
        // Point B: closer to second vertex (70%-90% along edge)
        double edgePointsA[6][3]; // Points near first vertex
        double edgePointsB[6][3]; // Points near second vertex
        
        for(int e = 0; e < 6; e++) {
            int a = edges[e][0];
            int b = edges[e][1];
            
            float tA = 0.35f + ((float)std::rand() / RAND_MAX) * 0.25f; // 15%-40%
            edgePointsA[e][0] = v[a][0] + tA * (v[b][0] - v[a][0]);
            edgePointsA[e][1] = v[a][1] + tA * (v[b][1] - v[a][1]);
            edgePointsA[e][2] = v[a][2] + tA * (v[b][2] - v[a][2]);
            
            float tB = 0.6f + ((float)std::rand() / RAND_MAX) * 0.25f;  // 60%-85%
            edgePointsB[e][0] = v[a][0] + tB * (v[b][0] - v[a][0]);
            edgePointsB[e][1] = v[a][1] + tB * (v[b][1] - v[a][1]);
            edgePointsB[e][2] = v[a][2] + tB * (v[b][2] - v[a][2]);
        }
        
        // ============================================================
        // WRITE 5 SEPARATE FILES: 4 CORNERS + 1 CENTER
        // ============================================================
        
        // Edge naming:
        // ep[0] connects v0-v1 → epA[0] near v0, epB[0] near v1
        // ep[1] connects v0-v2 → epA[1] near v0, epB[1] near v2
        // ep[2] connects v0-v3 → epA[2] near v0, epB[2] near v3
        // ep[3] connects v1-v2 → epA[3] near v1, epB[3] near v2
        // ep[4] connects v1-v3 → epA[4] near v1, epB[4] near v3
        // ep[5] connects v2-v3 → epA[5] near v2, epB[5] near v3
        
        // --- CORNER 0: v[0] and points NEAR v0 ---
        // Edges touching v0: ep[0], ep[1], ep[2]
        // We want: v0, epA[0], epA[1], epA[2]
        {
            std::vector<double> vertices;
            std::vector<std::vector<int>> faces;
            
            vertices.push_back(v[0][0]); vertices.push_back(v[0][1]); vertices.push_back(v[0][2]); // idx 0
            vertices.push_back(edgePointsA[0][0]); vertices.push_back(edgePointsA[0][1]); vertices.push_back(edgePointsA[0][2]); // idx 1
            vertices.push_back(edgePointsA[1][0]); vertices.push_back(edgePointsA[1][1]); vertices.push_back(edgePointsA[1][2]); // idx 2
            vertices.push_back(edgePointsA[2][0]); vertices.push_back(edgePointsA[2][1]); vertices.push_back(edgePointsA[2][2]); // idx 3
            
            faces.push_back({0, 1, 2});
            faces.push_back({0, 1, 3});
            faces.push_back({0, 2, 3});
            faces.push_back({1, 2, 3});
            
            std::ostringstream filename;
            filename << "models/ply/cube_test/tetra_" << std::setw(4) << std::setfill('0') << tetIdx << "_corner0.ply";
            writePLY(filename.str(), vertices, faces);
            filesWritten++;
        }
        
        // --- CORNER 1: v[1] and points NEAR v1 ---
        // Edges touching v1: ep[0] (from v0), ep[3], ep[4]
        // We want: v1, epB[0], epA[3], epA[4]
        {
            std::vector<double> vertices;
            std::vector<std::vector<int>> faces;
            
            vertices.push_back(v[1][0]); vertices.push_back(v[1][1]); vertices.push_back(v[1][2]);
            vertices.push_back(edgePointsB[0][0]); vertices.push_back(edgePointsB[0][1]); vertices.push_back(edgePointsB[0][2]);
            vertices.push_back(edgePointsA[3][0]); vertices.push_back(edgePointsA[3][1]); vertices.push_back(edgePointsA[3][2]);
            vertices.push_back(edgePointsA[4][0]); vertices.push_back(edgePointsA[4][1]); vertices.push_back(edgePointsA[4][2]);
            
            faces.push_back({0, 1, 2});
            faces.push_back({0, 1, 3});
            faces.push_back({0, 2, 3});
            faces.push_back({1, 2, 3});
            
            std::ostringstream filename;
            filename << "models/ply/cube_test/tetra_" << std::setw(4) << std::setfill('0') << tetIdx << "_corner1.ply";
            writePLY(filename.str(), vertices, faces);
            filesWritten++;
        }
        
        // --- CORNER 2: v[2] and points NEAR v2 ---
        // Edges touching v2: ep[1] (from v0), ep[3] (from v1), ep[5]
        // We want: v2, epB[1], epB[3], epA[5]
        {
            std::vector<double> vertices;
            std::vector<std::vector<int>> faces;
            
            vertices.push_back(v[2][0]); vertices.push_back(v[2][1]); vertices.push_back(v[2][2]);
            vertices.push_back(edgePointsB[1][0]); vertices.push_back(edgePointsB[1][1]); vertices.push_back(edgePointsB[1][2]);
            vertices.push_back(edgePointsB[3][0]); vertices.push_back(edgePointsB[3][1]); vertices.push_back(edgePointsB[3][2]);
            vertices.push_back(edgePointsA[5][0]); vertices.push_back(edgePointsA[5][1]); vertices.push_back(edgePointsA[5][2]);
            
            faces.push_back({0, 1, 2});
            faces.push_back({0, 1, 3});
            faces.push_back({0, 2, 3});
            faces.push_back({1, 2, 3});
            
            std::ostringstream filename;
            filename << "models/ply/cube_test/tetra_" << std::setw(4) << std::setfill('0') << tetIdx << "_corner2.ply";
            writePLY(filename.str(), vertices, faces);
            filesWritten++;
        }
        
        // --- CORNER 3: v[3] and points NEAR v3 ---
        // Edges touching v3: ep[2] (from v0), ep[4] (from v1), ep[5] (from v2)
        // We want: v3, epB[2], epB[4], epB[5]
        {
            std::vector<double> vertices;
            std::vector<std::vector<int>> faces;
            
            vertices.push_back(v[3][0]); vertices.push_back(v[3][1]); vertices.push_back(v[3][2]);
            vertices.push_back(edgePointsB[2][0]); vertices.push_back(edgePointsB[2][1]); vertices.push_back(edgePointsB[2][2]);
            vertices.push_back(edgePointsB[4][0]); vertices.push_back(edgePointsB[4][1]); vertices.push_back(edgePointsB[4][2]);
            vertices.push_back(edgePointsB[5][0]); vertices.push_back(edgePointsB[5][1]); vertices.push_back(edgePointsB[5][2]);
            
            faces.push_back({0, 1, 2});
            faces.push_back({0, 1, 3});
            faces.push_back({0, 2, 3});
            faces.push_back({1, 2, 3});
            
            std::ostringstream filename;
            filename << "models/ply/cube_test/tetra_" << std::setw(4) << std::setfill('0') << tetIdx << "_corner3.ply";
            writePLY(filename.str(), vertices, faces);
            filesWritten++;
        }
        
        // --- CENTER PIECE: All 12 edge points (2 per edge) ---
        // Now we have 12 vertices forming a more complex, irregular shape
        {
            std::vector<double> vertices;
            std::vector<std::vector<int>> faces;
            
            // Add all 12 edge points (6 edges × 2 points each)
            // Indices: 
            // 0,1   = edge 0 (v0-v1): epA[0], epB[0]
            // 2,3   = edge 1 (v0-v2): epA[1], epB[1]
            // 4,5   = edge 2 (v0-v3): epA[2], epB[2]
            // 6,7   = edge 3 (v1-v2): epA[3], epB[3]
            // 8,9   = edge 4 (v1-v3): epA[4], epB[4]
            // 10,11 = edge 5 (v2-v3): epA[5], epB[5]
            
            for(int e = 0; e < 6; e++) {
                vertices.push_back(edgePointsA[e][0]); vertices.push_back(edgePointsA[e][1]); vertices.push_back(edgePointsA[e][2]);
                vertices.push_back(edgePointsB[e][0]); vertices.push_back(edgePointsB[e][1]); vertices.push_back(edgePointsB[e][2]);
            }
            
            // Now build faces. Each original tetrahedron face becomes a more complex polygon.
            // We need to triangulate the resulting shapes.
            
            // Original face v0-v1-v2:
            // Perimeter points: epA[0] (near v0 on edge v0-v1)
            //                   epB[0] (near v1 on edge v0-v1)
            //                   epA[3] (near v1 on edge v1-v2)
            //                   epB[3] (near v2 on edge v1-v2)
            //                   epB[1] (near v2 on edge v0-v2)
            //                   epA[1] (near v0 on edge v0-v2)
            // Creating a hexagon, need to triangulate
            // Simplified triangulation (fan from first point):
            faces.push_back({0, 1, 6});    // epA[0], epB[0], epA[3]
            faces.push_back({0, 6, 7});    // epA[0], epA[3], epB[3]
            faces.push_back({0, 7, 3});    // epA[0], epB[3], epB[1]
            faces.push_back({0, 3, 2});    // epA[0], epB[1], epA[1]
            
            // Original face v0-v1-v3:
            // Perimeter: epA[0], epB[0], epA[4], epB[4], epB[2], epA[2]
            faces.push_back({0, 1, 8});
            faces.push_back({0, 8, 9});
            faces.push_back({0, 9, 5});
            faces.push_back({0, 5, 4});
            
            // Original face v0-v2-v3:
            // Perimeter: epA[1], epB[1], epA[5], epB[5], epB[2], epA[2]
            faces.push_back({2, 3, 10});
            faces.push_back({2, 10, 11});
            faces.push_back({2, 11, 5});
            faces.push_back({2, 5, 4});
            
            // Original face v1-v2-v3:
            // Perimeter: epB[0], epA[3], epB[3], epA[5], epB[5], epB[4], epA[4]
            faces.push_back({1, 6, 7});
            faces.push_back({1, 7, 10});
            faces.push_back({1, 10, 11});
            faces.push_back({1, 11, 9});
            faces.push_back({1, 9, 8});
            
            std::ostringstream filename;
            filename << "models/ply/cube_test/tetra_" << std::setw(4) << std::setfill('0') << tetIdx << "_center.ply";
            writePLY(filename.str(), vertices, faces);
            filesWritten++;
        }
    }
    
    std::cout << "Wrote " << filesWritten << " separate PLY files (5 per tetrahedron)." << std::endl;

    // Write .tet file
    std::string tetFileName = "models/ply/cube_test/Cube_tetrahedra.tet";
    std::ofstream tetFile(tetFileName);
    if (tetFile.is_open()) {
        tetFile << out.numberoftetrahedra << std::endl;
        for (int i = 0; i < out.numberoftetrahedra; i++) {
            tetFile << out.tetrahedronlist[i*4+0] << " " 
                    << out.tetrahedronlist[i*4+1] << " " 
                    << out.tetrahedronlist[i*4+2] << " " 
                    << out.tetrahedronlist[i*4+3] << std::endl;
        }
        tetFile.close();
    }

    std::cout << "Tetgen processing complete!" << std::endl;
    
    return 0;
}