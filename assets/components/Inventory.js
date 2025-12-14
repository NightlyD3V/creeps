// This component manages the inventory system for a game.
// It allows players to add, remove, and view items in their inventory. 

// Check for raycast intersections with inventory items
import * as THREE from 'three';

export function Inventory(scene, character, camera, raycaster, mouse) { 
    const inventoryItems = [];

    // Function to add an item to the inventory
    function addItem(item) {
        inventoryItems.push(item);
        console.log(`Item added: ${item.name}`);
    }   
    // Function to remove an item from the inventory
    function removeItem(itemName) {
        const index = inventoryItems.findIndex(item => item.name === itemName);
        if (index !== -1) {
            inventoryItems.splice(index, 1);
            console.log(`Item removed: ${itemName}`);
        } else {
            console.log(`Item not found: ${itemName}`);
        }
    }   
    // Function to view all items in the inventory
    function viewItems() {
        console.log("Inventory Items:");
        inventoryItems.forEach(item => {
            console.log(`- ${item.name}`);
        });
    }
    return {
        addItem,
        removeItem,
        viewItems
    };
}