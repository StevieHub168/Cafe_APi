-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:8889
-- Generation Time: May 23, 2026 at 11:34 AM
-- Server version: 8.0.40
-- PHP Version: 8.3.14

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `cafe_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--

CREATE TABLE `categories` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `categories`
--

INSERT INTO `categories` (`id`, `name`, `description`, `created_at`) VALUES
(1, 'Coffee', 'Coffee drinks', '2026-03-28 07:29:57'),
(2, 'Tea', 'Tea drinks', '2026-03-28 07:29:57'),
(3, 'Milk', 'Milk-based drinks', '2026-03-28 07:29:57'),
(4, 'Smoothie', 'Fruit smoothies', '2026-03-28 07:29:57'),
(5, 'Dessert', 'Desserts', '2026-03-28 07:29:57');

-- --------------------------------------------------------

--
-- Table structure for table `items`
--

CREATE TABLE `items` (
  `id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `category_id` int NOT NULL,
  `description` text,
  `price` decimal(10,2) NOT NULL,
  `temperature` varchar(20) DEFAULT NULL,
  `image` text,
  `is_available` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `items`
--

INSERT INTO `items` (`id`, `name`, `category_id`, `description`, `price`, `temperature`, `image`, `is_available`, `created_at`) VALUES
(1, 'Espresso', 1, 'Strong coffee', 2.50, 'Hot', 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&q=80', 1, '2026-03-28 07:29:57'),
(2, 'Americano', 1, 'Black coffee', 3.00, 'Hot', 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=400&q=80', 1, '2026-03-28 07:29:57'),
(3, 'Latte', 1, 'Milk coffee', 3.50, 'Hot', 'https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&q=80', 1, '2026-03-28 07:29:57'),
(4, 'Iced Latte', 1, 'Cold milk coffee', 3.80, 'Cold', 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&q=80', 1, '2026-03-28 07:29:57'),
(5, 'Cappuccino', 1, 'Foamy coffee', 3.60, 'Hot', 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=80', 1, '2026-03-28 07:29:57'),
(6, 'Green Tea', 2, 'Hot tea', 2.20, 'Hot', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80', 1, '2026-03-28 07:29:57'),
(7, 'Iced Lemon Tea', 2, 'Cold tea', 2.80, 'Cold', 'https://images.unsplash.com/photo-1499638673689-79a0b5115d87?w=400&q=80', 1, '2026-03-28 07:29:57'),
(8, 'Milk Tea', 2, 'Tea with milk', 3.10, 'Cold', 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=400&q=80', 1, '2026-03-28 07:29:57'),
(9, 'Chocolate Milk', 3, 'Chocolate milk', 3.00, 'Cold', 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80', 1, '2026-03-28 07:29:57'),
(10, 'Strawberry Smoothie', 4, 'Fresh smoothie', 4.20, 'Cold', 'https://images.unsplash.com/photo-1553530666-ba11a90a3dce?w=400&q=80', 0, '2026-03-28 07:29:57'),
(11, 'Mango Smoothie', 4, 'Fresh smoothie', 4.20, 'Cold', 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=400&q=80', 1, '2026-03-28 07:29:57'),
(12, 'Cheesecake', 5, 'Cake slice', 3.90, 'Cold', 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=400&q=80', 1, '2026-03-28 07:29:57');

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int NOT NULL,
  `invoice_number` varchar(50) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `payment_status` varchar(20) NOT NULL DEFAULT 'SUCCESS',
  `cashier_name` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `invoice_number`, `total`, `payment_status`, `cashier_name`, `created_at`) VALUES
(1, '#MOCK0001', 26.70, 'SUCCESS', 'Cashier 2', '2026-03-28 02:42:44'),
(2, '#MOCK0002', 23.70, 'SUCCESS', 'Cashier 1', '2026-03-28 01:13:12'),
(3, '#MOCK0003', 19.20, 'SUCCESS', 'Admin', '2026-03-28 05:19:50'),
(4, '#MOCK0004', 6.20, 'SUCCESS', 'Cashier 2', '2026-03-28 04:53:07'),
(5, '#MOCK0005', 8.40, 'SUCCESS', 'Admin', '2026-03-28 04:48:29'),
(6, '#MOCK0006', 6.00, 'SUCCESS', 'Cashier 1', '2026-03-28 07:01:04'),
(7, '#MOCK0007', 15.10, 'SUCCESS', 'Admin', '2026-03-28 04:37:04'),
(8, '#MOCK0008', 8.80, 'SUCCESS', 'Cashier 2', '2026-03-28 01:34:42'),
(9, '#MOCK0009', 14.70, 'SUCCESS', 'Cashier 2', '2026-03-28 04:38:06'),
(10, '#MOCK0010', 21.60, 'SUCCESS', 'Admin', '2026-03-28 02:54:42'),
(11, '#MOCK0011', 25.80, 'SUCCESS', 'Admin', '2026-03-28 09:05:22'),
(12, '#MOCK0012', 9.00, 'SUCCESS', 'Cashier 2', '2026-03-28 06:48:05'),
(13, '#MOCK0013', 17.80, 'SUCCESS', 'Admin', '2026-03-28 02:15:08'),
(14, '#MOCK0014', 6.90, 'SUCCESS', 'Cashier 1', '2026-03-28 04:15:40'),
(15, '#MOCK0015', 21.20, 'SUCCESS', 'Cashier 2', '2026-03-28 02:02:10'),
(16, '#MOCK0016', 23.00, 'SUCCESS', 'Admin', '2026-03-28 03:59:44'),
(17, '#MOCK0017', 9.00, 'SUCCESS', 'Admin', '2026-03-28 08:52:19'),
(18, '#MOCK0018', 22.70, 'SUCCESS', 'Admin', '2026-03-28 12:43:10'),
(19, '#MOCK0019', 15.10, 'SUCCESS', 'Cashier 2', '2026-03-28 12:53:07'),
(20, '#MOCK0020', 13.00, 'SUCCESS', 'Cashier 2', '2026-03-28 06:01:56'),
(21, '#MOCK0021', 19.40, 'SUCCESS', 'Cashier 2', '2026-03-28 06:08:24'),
(22, '#MOCK0022', 12.00, 'SUCCESS', 'Cashier 2', '2026-03-28 10:03:48'),
(23, '#MOCK0023', 3.00, 'SUCCESS', 'Admin', '2026-03-28 04:53:04'),
(24, '#MOCK0024', 7.20, 'SUCCESS', 'Cashier 2', '2026-03-28 06:01:06'),
(25, '#MOCK0025', 12.20, 'SUCCESS', 'Admin', '2026-03-28 13:22:37'),
(26, '#MOCK0026', 29.60, 'SUCCESS', 'Admin', '2026-03-28 07:36:08'),
(27, '#MOCK0027', 7.60, 'SUCCESS', 'Admin', '2026-03-28 02:53:03'),
(28, '#MOCK0028', 13.00, 'SUCCESS', 'Cashier 1', '2026-03-28 10:45:11'),
(29, '#MOCK0029', 14.10, 'SUCCESS', 'Admin', '2026-03-28 10:55:08'),
(30, '#MOCK0030', 21.20, 'SUCCESS', 'Admin', '2026-03-28 03:07:48'),
(31, '#MOCK0031', 18.40, 'SUCCESS', 'Cashier 1', '2026-03-23 12:04:29'),
(32, '#MOCK0032', 17.70, 'SUCCESS', 'Cashier 1', '2026-03-23 08:44:25'),
(33, '#MOCK0033', 13.30, 'SUCCESS', 'Cashier 2', '2026-03-24 02:40:39'),
(34, '#MOCK0034', 22.30, 'SUCCESS', 'Cashier 2', '2026-03-27 08:05:28'),
(35, '#MOCK0035', 7.60, 'SUCCESS', 'Cashier 2', '2026-03-22 11:50:30'),
(36, '#MOCK0036', 20.40, 'SUCCESS', 'Cashier 1', '2026-03-25 09:28:26'),
(37, '#MOCK0037', 26.20, 'SUCCESS', 'Cashier 2', '2026-03-22 11:25:27'),
(38, '#MOCK0038', 11.40, 'SUCCESS', 'Cashier 2', '2026-03-23 09:35:17'),
(39, '#MOCK0039', 33.20, 'SUCCESS', 'Admin', '2026-03-25 05:05:38'),
(40, '#MOCK0040', 28.60, 'SUCCESS', 'Cashier 2', '2026-03-25 12:29:27'),
(41, '#MOCK0041', 10.10, 'SUCCESS', 'Cashier 1', '2026-03-26 11:00:04'),
(42, '#MOCK0042', 7.20, 'SUCCESS', 'Cashier 2', '2026-03-22 10:13:59'),
(43, '#MOCK0043', 2.80, 'SUCCESS', 'Cashier 1', '2026-03-25 09:05:48'),
(44, '#MOCK0044', 3.00, 'SUCCESS', 'Cashier 1', '2026-03-23 06:40:03'),
(45, '#MOCK0045', 36.70, 'SUCCESS', 'Cashier 1', '2026-03-22 05:18:22'),
(46, '#MOCK0046', 7.80, 'SUCCESS', 'Admin', '2026-03-26 06:41:40'),
(47, '#MOCK0047', 3.50, 'SUCCESS', 'Admin', '2026-03-22 04:37:21'),
(48, '#MOCK0048', 26.80, 'SUCCESS', 'Cashier 1', '2026-03-25 06:37:08'),
(49, '#MOCK0049', 21.60, 'SUCCESS', 'Cashier 2', '2026-03-24 06:16:09'),
(50, '#MOCK0050', 18.80, 'SUCCESS', 'Cashier 2', '2026-03-22 12:23:38'),
(51, '#MOCK0051', 11.40, 'SUCCESS', 'Cashier 1', '2026-03-24 04:44:10'),
(52, '#MOCK0052', 8.40, 'SUCCESS', 'Cashier 2', '2026-03-27 06:56:17'),
(53, '#MOCK0053', 21.30, 'SUCCESS', 'Admin', '2026-03-27 11:01:11'),
(54, '#MOCK0054', 18.90, 'SUCCESS', 'Cashier 1', '2026-03-24 03:38:03'),
(55, '#MOCK0055', 2.20, 'SUCCESS', 'Cashier 1', '2026-03-26 04:14:54'),
(56, '#MOCK0056', 22.50, 'SUCCESS', 'Cashier 1', '2026-03-23 07:05:24'),
(57, '#MOCK0057', 12.20, 'SUCCESS', 'Cashier 2', '2026-03-23 05:42:18'),
(58, '#MOCK0058', 33.80, 'SUCCESS', 'Admin', '2026-03-26 11:17:56'),
(59, '#MOCK0059', 21.60, 'SUCCESS', 'Admin', '2026-03-26 06:07:09'),
(60, '#MOCK0060', 24.80, 'SUCCESS', 'Admin', '2026-03-22 05:51:57'),
(61, '#5118', 2.50, 'SUCCESS', 'admin', '2026-03-28 07:35:45'),
(62, '#5575', 2.50, 'SUCCESS', 'admin', '2026-03-28 07:35:45'),
(63, '#5514', 2.50, 'SUCCESS', 'admin', '2026-03-28 07:36:15'),
(64, '#3703', 3.00, 'SUCCESS', 'admin', '2026-03-28 07:36:43'),
(65, '#1489', 3.80, 'SUCCESS', 'admin', '2026-03-28 07:38:21'),
(66, '#4953', 8.80, 'SUCCESS', 'admin', '2026-03-28 07:48:34'),
(67, '#5575', 8.80, 'SUCCESS', 'admin', '2026-03-28 07:48:35'),
(68, '#7067', 3.80, 'SUCCESS', 'admin', '2026-03-28 12:23:57'),
(69, '#4292', 22.00, 'SUCCESS', 'Pichsokleap', '2026-04-08 10:55:14'),
(70, '#7953', 3.00, 'SUCCESS', 'Pichsokleap', '2026-04-18 07:06:38');

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `id` int NOT NULL,
  `order_id` int NOT NULL,
  `item_id` int DEFAULT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` int NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`id`, `order_id`, `item_id`, `item_name`, `quantity`, `subtotal`, `created_at`) VALUES
(1, 1, 8, 'Milk Tea', 2, 6.20, '2026-03-28 02:42:44'),
(2, 1, 11, 'Mango Smoothie', 1, 4.20, '2026-03-28 02:42:44'),
(3, 1, 3, 'Latte', 2, 7.00, '2026-03-28 02:42:44'),
(4, 1, 8, 'Milk Tea', 3, 9.30, '2026-03-28 02:42:44'),
(5, 2, 6, 'Green Tea', 1, 2.20, '2026-03-28 01:13:12'),
(6, 2, 7, 'Iced Lemon Tea', 3, 8.40, '2026-03-28 01:13:12'),
(7, 2, 4, 'Iced Latte', 1, 3.80, '2026-03-28 01:13:12'),
(8, 2, 8, 'Milk Tea', 3, 9.30, '2026-03-28 01:13:12'),
(9, 3, 10, 'Strawberry Smoothie', 3, 12.60, '2026-03-28 05:19:50'),
(10, 3, 6, 'Green Tea', 3, 6.60, '2026-03-28 05:19:50'),
(11, 4, 8, 'Milk Tea', 2, 6.20, '2026-03-28 04:53:07'),
(12, 5, 7, 'Iced Lemon Tea', 3, 8.40, '2026-03-28 04:48:29'),
(13, 6, 2, 'Americano', 2, 6.00, '2026-03-28 07:01:04'),
(14, 7, 4, 'Iced Latte', 2, 7.60, '2026-03-28 04:37:04'),
(15, 7, 1, 'Espresso', 3, 7.50, '2026-03-28 04:37:04'),
(16, 8, 6, 'Green Tea', 2, 4.40, '2026-03-28 01:34:42'),
(17, 8, 6, 'Green Tea', 2, 4.40, '2026-03-28 01:34:42'),
(18, 9, 5, 'Cappuccino', 3, 10.80, '2026-03-28 04:38:06'),
(19, 9, 12, 'Cheesecake', 1, 3.90, '2026-03-28 04:38:06'),
(20, 10, 8, 'Milk Tea', 3, 9.30, '2026-03-28 02:54:42'),
(21, 10, 10, 'Strawberry Smoothie', 2, 8.40, '2026-03-28 02:54:42'),
(22, 10, 12, 'Cheesecake', 1, 3.90, '2026-03-28 02:54:42'),
(23, 11, 6, 'Green Tea', 2, 4.40, '2026-03-28 09:05:22'),
(24, 11, 5, 'Cappuccino', 3, 10.80, '2026-03-28 09:05:22'),
(25, 11, 1, 'Espresso', 3, 7.50, '2026-03-28 09:05:22'),
(26, 11, 8, 'Milk Tea', 1, 3.10, '2026-03-28 09:05:22'),
(27, 12, 9, 'Chocolate Milk', 3, 9.00, '2026-03-28 06:48:05'),
(28, 13, 4, 'Iced Latte', 1, 3.80, '2026-03-28 02:15:08'),
(29, 13, 8, 'Milk Tea', 2, 6.20, '2026-03-28 02:15:08'),
(30, 13, 12, 'Cheesecake', 2, 7.80, '2026-03-28 02:15:08'),
(31, 14, 8, 'Milk Tea', 1, 3.10, '2026-03-28 04:15:40'),
(32, 14, 4, 'Iced Latte', 1, 3.80, '2026-03-28 04:15:40'),
(33, 15, 8, 'Milk Tea', 2, 6.20, '2026-03-28 02:02:10'),
(34, 15, 5, 'Cappuccino', 3, 10.80, '2026-03-28 02:02:10'),
(35, 15, 11, 'Mango Smoothie', 1, 4.20, '2026-03-28 02:02:10'),
(36, 16, 11, 'Mango Smoothie', 2, 8.40, '2026-03-28 03:59:44'),
(37, 16, 1, 'Espresso', 2, 5.00, '2026-03-28 03:59:44'),
(38, 16, 6, 'Green Tea', 3, 6.60, '2026-03-28 03:59:44'),
(39, 16, 9, 'Chocolate Milk', 1, 3.00, '2026-03-28 03:59:44'),
(40, 17, 2, 'Americano', 3, 9.00, '2026-03-28 08:52:19'),
(41, 18, 9, 'Chocolate Milk', 1, 3.00, '2026-03-28 12:43:10'),
(42, 18, 10, 'Strawberry Smoothie', 2, 8.40, '2026-03-28 12:43:10'),
(43, 18, 3, 'Latte', 1, 3.50, '2026-03-28 12:43:10'),
(44, 18, 12, 'Cheesecake', 2, 7.80, '2026-03-28 12:43:10'),
(45, 19, 3, 'Latte', 2, 7.00, '2026-03-28 12:53:07'),
(46, 19, 1, 'Espresso', 1, 2.50, '2026-03-28 12:53:07'),
(47, 19, 7, 'Iced Lemon Tea', 2, 5.60, '2026-03-28 12:53:07'),
(48, 20, 3, 'Latte', 3, 10.50, '2026-03-28 06:01:56'),
(49, 20, 1, 'Espresso', 1, 2.50, '2026-03-28 06:01:56'),
(50, 21, 4, 'Iced Latte', 2, 7.60, '2026-03-28 06:08:24'),
(51, 21, 9, 'Chocolate Milk', 3, 9.00, '2026-03-28 06:08:24'),
(52, 21, 7, 'Iced Lemon Tea', 1, 2.80, '2026-03-28 06:08:24'),
(53, 22, 5, 'Cappuccino', 1, 3.60, '2026-03-28 10:03:48'),
(54, 22, 7, 'Iced Lemon Tea', 3, 8.40, '2026-03-28 10:03:48'),
(55, 23, 9, 'Chocolate Milk', 1, 3.00, '2026-03-28 04:53:04'),
(56, 24, 9, 'Chocolate Milk', 1, 3.00, '2026-03-28 06:01:06'),
(57, 24, 11, 'Mango Smoothie', 1, 4.20, '2026-03-28 06:01:06'),
(58, 25, 4, 'Iced Latte', 1, 3.80, '2026-03-28 13:22:37'),
(59, 25, 10, 'Strawberry Smoothie', 1, 4.20, '2026-03-28 13:22:37'),
(60, 25, 11, 'Mango Smoothie', 1, 4.20, '2026-03-28 13:22:37'),
(61, 26, 11, 'Mango Smoothie', 2, 8.40, '2026-03-28 07:36:08'),
(62, 26, 8, 'Milk Tea', 2, 6.20, '2026-03-28 07:36:08'),
(63, 26, 2, 'Americano', 3, 9.00, '2026-03-28 07:36:08'),
(64, 26, 9, 'Chocolate Milk', 2, 6.00, '2026-03-28 07:36:08'),
(65, 27, 4, 'Iced Latte', 2, 7.60, '2026-03-28 02:53:03'),
(66, 28, 5, 'Cappuccino', 3, 10.80, '2026-03-28 10:45:11'),
(67, 28, 6, 'Green Tea', 1, 2.20, '2026-03-28 10:45:11'),
(68, 29, 5, 'Cappuccino', 1, 3.60, '2026-03-28 10:55:08'),
(69, 29, 3, 'Latte', 3, 10.50, '2026-03-28 10:55:08'),
(70, 30, 1, 'Espresso', 3, 7.50, '2026-03-28 03:07:48'),
(71, 30, 6, 'Green Tea', 2, 4.40, '2026-03-28 03:07:48'),
(72, 30, 8, 'Milk Tea', 3, 9.30, '2026-03-28 03:07:48'),
(73, 31, 10, 'Strawberry Smoothie', 1, 4.20, '2026-03-23 12:04:29'),
(74, 31, 5, 'Cappuccino', 2, 7.20, '2026-03-23 12:04:29'),
(75, 31, 3, 'Latte', 2, 7.00, '2026-03-23 12:04:29'),
(76, 32, 12, 'Cheesecake', 3, 11.70, '2026-03-23 08:44:25'),
(77, 32, 2, 'Americano', 2, 6.00, '2026-03-23 08:44:25'),
(78, 33, 5, 'Cappuccino', 1, 3.60, '2026-03-24 02:40:39'),
(79, 33, 1, 'Espresso', 3, 7.50, '2026-03-24 02:40:39'),
(80, 33, 6, 'Green Tea', 1, 2.20, '2026-03-24 02:40:39'),
(81, 34, 1, 'Espresso', 1, 2.50, '2026-03-27 08:05:28'),
(82, 34, 3, 'Latte', 3, 10.50, '2026-03-27 08:05:28'),
(83, 34, 8, 'Milk Tea', 3, 9.30, '2026-03-27 08:05:28'),
(84, 35, 4, 'Iced Latte', 2, 7.60, '2026-03-22 11:50:30'),
(85, 36, 9, 'Chocolate Milk', 1, 3.00, '2026-03-25 09:28:26'),
(86, 36, 6, 'Green Tea', 3, 6.60, '2026-03-25 09:28:26'),
(87, 36, 5, 'Cappuccino', 1, 3.60, '2026-03-25 09:28:26'),
(88, 36, 5, 'Cappuccino', 2, 7.20, '2026-03-25 09:28:26'),
(89, 37, 4, 'Iced Latte', 3, 11.40, '2026-03-22 11:25:27'),
(90, 37, 6, 'Green Tea', 1, 2.20, '2026-03-22 11:25:27'),
(91, 37, 10, 'Strawberry Smoothie', 3, 12.60, '2026-03-22 11:25:27'),
(92, 38, 4, 'Iced Latte', 3, 11.40, '2026-03-23 09:35:17'),
(93, 39, 7, 'Iced Lemon Tea', 2, 5.60, '2026-03-25 05:05:38'),
(94, 39, 10, 'Strawberry Smoothie', 2, 8.40, '2026-03-25 05:05:38'),
(95, 39, 11, 'Mango Smoothie', 2, 8.40, '2026-03-25 05:05:38'),
(96, 39, 5, 'Cappuccino', 3, 10.80, '2026-03-25 05:05:38'),
(97, 40, 7, 'Iced Lemon Tea', 2, 5.60, '2026-03-25 12:29:27'),
(98, 40, 8, 'Milk Tea', 2, 6.20, '2026-03-25 12:29:27'),
(99, 40, 11, 'Mango Smoothie', 3, 12.60, '2026-03-25 12:29:27'),
(100, 40, 11, 'Mango Smoothie', 1, 4.20, '2026-03-25 12:29:27'),
(101, 41, 1, 'Espresso', 1, 2.50, '2026-03-26 11:00:04'),
(102, 41, 4, 'Iced Latte', 2, 7.60, '2026-03-26 11:00:04'),
(103, 42, 6, 'Green Tea', 2, 4.40, '2026-03-22 10:13:59'),
(104, 42, 7, 'Iced Lemon Tea', 1, 2.80, '2026-03-22 10:13:59'),
(105, 43, 7, 'Iced Lemon Tea', 1, 2.80, '2026-03-25 09:05:48'),
(106, 44, 9, 'Chocolate Milk', 1, 3.00, '2026-03-23 06:40:03'),
(107, 45, 3, 'Latte', 2, 7.00, '2026-03-22 05:18:22'),
(108, 45, 5, 'Cappuccino', 3, 10.80, '2026-03-22 05:18:22'),
(109, 45, 11, 'Mango Smoothie', 2, 8.40, '2026-03-22 05:18:22'),
(110, 45, 3, 'Latte', 3, 10.50, '2026-03-22 05:18:22'),
(111, 46, 12, 'Cheesecake', 2, 7.80, '2026-03-26 06:41:40'),
(112, 47, 3, 'Latte', 1, 3.50, '2026-03-22 04:37:21'),
(113, 48, 8, 'Milk Tea', 2, 6.20, '2026-03-25 06:37:08'),
(114, 48, 8, 'Milk Tea', 2, 6.20, '2026-03-25 06:37:08'),
(115, 48, 12, 'Cheesecake', 1, 3.90, '2026-03-25 06:37:08'),
(116, 48, 3, 'Latte', 3, 10.50, '2026-03-25 06:37:08'),
(117, 49, 2, 'Americano', 3, 9.00, '2026-03-24 06:16:09'),
(118, 49, 11, 'Mango Smoothie', 3, 12.60, '2026-03-24 06:16:09'),
(119, 50, 5, 'Cappuccino', 1, 3.60, '2026-03-22 12:23:38'),
(120, 50, 8, 'Milk Tea', 2, 6.20, '2026-03-22 12:23:38'),
(121, 50, 9, 'Chocolate Milk', 3, 9.00, '2026-03-22 12:23:38'),
(122, 51, 4, 'Iced Latte', 3, 11.40, '2026-03-24 04:44:10'),
(123, 52, 10, 'Strawberry Smoothie', 2, 8.40, '2026-03-27 06:56:17'),
(124, 53, 12, 'Cheesecake', 2, 7.80, '2026-03-27 11:01:11'),
(125, 53, 2, 'Americano', 2, 6.00, '2026-03-27 11:01:11'),
(126, 53, 1, 'Espresso', 3, 7.50, '2026-03-27 11:01:11'),
(127, 54, 7, 'Iced Lemon Tea', 3, 8.40, '2026-03-24 03:38:03'),
(128, 54, 3, 'Latte', 3, 10.50, '2026-03-24 03:38:03'),
(129, 55, 6, 'Green Tea', 1, 2.20, '2026-03-26 04:14:54'),
(130, 56, 3, 'Latte', 3, 10.50, '2026-03-23 07:05:24'),
(131, 56, 6, 'Green Tea', 2, 4.40, '2026-03-23 07:05:24'),
(132, 56, 4, 'Iced Latte', 2, 7.60, '2026-03-23 07:05:24'),
(133, 57, 4, 'Iced Latte', 1, 3.80, '2026-03-23 05:42:18'),
(134, 57, 11, 'Mango Smoothie', 2, 8.40, '2026-03-23 05:42:18'),
(135, 58, 5, 'Cappuccino', 3, 10.80, '2026-03-26 11:17:56'),
(136, 58, 1, 'Espresso', 2, 5.00, '2026-03-26 11:17:56'),
(137, 58, 1, 'Espresso', 3, 7.50, '2026-03-26 11:17:56'),
(138, 58, 3, 'Latte', 3, 10.50, '2026-03-26 11:17:56'),
(139, 59, 2, 'Americano', 3, 9.00, '2026-03-26 06:07:09'),
(140, 59, 10, 'Strawberry Smoothie', 3, 12.60, '2026-03-26 06:07:09'),
(141, 60, 11, 'Mango Smoothie', 2, 8.40, '2026-03-22 05:51:57'),
(142, 60, 5, 'Cappuccino', 2, 7.20, '2026-03-22 05:51:57'),
(143, 60, 8, 'Milk Tea', 2, 6.20, '2026-03-22 05:51:57'),
(144, 60, 9, 'Chocolate Milk', 1, 3.00, '2026-03-22 05:51:57'),
(145, 61, 1, 'Espresso', 1, 2.50, '2026-03-28 07:35:45'),
(146, 62, 1, 'Espresso', 1, 2.50, '2026-03-28 07:35:45'),
(147, 63, 1, 'Espresso', 1, 2.50, '2026-03-28 07:36:15'),
(148, 64, 9, 'Chocolate Milk', 1, 3.00, '2026-03-28 07:36:43'),
(149, 65, 4, 'Iced Latte', 1, 3.80, '2026-03-28 07:38:21'),
(150, 66, 1, 'Espresso', 2, 5.00, '2026-03-28 07:48:34'),
(151, 66, 4, 'Iced Latte', 1, 3.80, '2026-03-28 07:48:34'),
(152, 67, 1, 'Espresso', 2, 5.00, '2026-03-28 07:48:35'),
(153, 67, 4, 'Iced Latte', 1, 3.80, '2026-03-28 07:48:35'),
(154, 68, 4, 'Iced Latte', 1, 3.80, '2026-03-28 12:23:57'),
(155, 69, 2, 'Americano', 1, 3.00, '2026-04-08 10:55:14'),
(156, 69, 9, 'Chocolate Milk', 1, 3.00, '2026-04-08 10:55:14'),
(157, 69, 4, 'Iced Latte', 1, 3.80, '2026-04-08 10:55:14'),
(158, 69, 8, 'Milk Tea', 1, 3.10, '2026-04-08 10:55:14'),
(159, 69, 7, 'Iced Lemon Tea', 2, 5.60, '2026-04-08 10:55:14'),
(160, 69, 3, 'Latte', 1, 3.50, '2026-04-08 10:55:14'),
(161, 70, 2, 'Americano', 1, 3.00, '2026-04-18 07:06:38');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL,
  `username` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `access_token` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `email`, `password`, `access_token`, `created_at`) VALUES
(2, 'Cashier 1', 'cashier1@gmail.com', '$2b$10$w8aHdC/tLxekzpnzOio.wOze3vkhyj6nljw3wZA/FcmLuPAlIaoNO', NULL, '2026-03-28 07:07:58'),
(3, 'Cashier 2', 'cashier2@gmail.com', '$2b$10$tfU4vnWPjjHJPMZ4s/JFw.98M.OWO80BSwk8SXpcv76LghNlweLYa', NULL, '2026-03-28 07:07:59'),
(5, 'Pichsokleap', 'admin@gmail.com', '$2b$10$JKrlNAT2BUAqAvDv33N9KOF3kona2RnPe1eJJmHL9RLlyWvMsok5K', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUsImlhdCI6MTc3NTY0NTY4OSwiZXhwIjoxNzc1NzMyMDg5fQ.rTtBT4PdZRKJosZQc77JOiloICyA4JL9dSnVFLKsl3Q', '2026-04-08 10:54:49');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `items`
--
ALTER TABLE `items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`),
  ADD KEY `idx_items_category_id` (`category_id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_orders_created_at` (`created_at`),
  ADD KEY `idx_orders_invoice_number` (`invoice_number`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_order_items_order_id` (`order_id`),
  ADD KEY `idx_order_items_item_id` (`item_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `items`
--
ALTER TABLE `items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=71;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=162;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `items`
--
ALTER TABLE `items`
  ADD CONSTRAINT `fk_items_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`);

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `fk_order_items_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
